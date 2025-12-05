from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body, Query
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel

from app.models.database import get_db
from app.models.schemas import (
    EmailResponse,
    ShipmentSessionResponse,
    ShipmentSessionCreate,
    ShipmentStatusEnum,
    VendorResponse,
    VendorCreate,
    VendorUpdate
)
from app.models.models import ShipmentStatus, Email, ShipmentSession, Vendor, EmailCategory
from app.services.smtp_service import smtp_service
from app.services.email_service import EmailService


router = APIRouter()

# ==========================================
# 1. HELPER MODELS
# ==========================================

class EmailReplyRequest(BaseModel):
    content: str

class SessionStatusUpdate(BaseModel):
    status: str

# ==========================================
# 2. HELPER FUNCTIONS
# ==========================================

def get_email_service(db: Session = Depends(get_db)) -> EmailService:
    """Dependency for Email service"""
    return EmailService(db)

def _generate_vendor_notification(session: ShipmentSession, vendor: Vendor) -> str:
    """Generate a casual, human-like notification email for vendor"""
    
    # Build the message casually
    vendor_name = vendor.name.split()[0] if vendor.name else 'there'
    message = f"Hey {vendor_name},\n\n"
    message += f"Just wanted to give you a heads up - we've got a new shipment booking (#{session.id}) that needs your attention.\n\n"
    
    message += "Here's what we're working with:\n\n"
    
    # Add shipment details in a casual way
    if session.package_description:
        message += f"Package: {session.package_description}\n"
    
    if session.sender_name and session.sender_city:
        message += f"Pickup: {session.sender_city}"
        if session.sender_state:
            message += f", {session.sender_state}"
        message += f" ({session.sender_name})\n"
    
    if session.recipient_name and session.recipient_city:
        message += f"Delivery: {session.recipient_city}"
        if session.recipient_state:
            message += f", {session.recipient_state}"
        message += f" ({session.recipient_name})\n"
    
    if session.package_weight:
        message += f"Weight: {session.package_weight}\n"
    
    if session.package_dimensions:
        message += f"Dimensions: {session.package_dimensions}\n"
    
    if session.service_type:
        message += f"Service: {session.service_type}\n"
    
    if session.pickup_date:
        message += f"Pickup Date: {session.pickup_date}\n"

    if session.delivery_date:
        message += f"Delivery Date: {session.delivery_date}\n"
    
    message += f"\n"
    
    # Closing
    message += "Can you take a look and let us know if you can handle this one? "
    message += "Just hit reply or give us a call if you need any more details.\n\n"
    message += "Thanks!\n"
    
    return message


# ==========================================
# 3. EMAIL ENDPOINTS
# ==========================================

@router.post("/emails/check", response_model=dict)
async def check_emails(
    background_tasks: BackgroundTasks,
    max_emails: int = 50,
    email_service: EmailService = Depends(get_email_service)
):
    """
    Check for new unread emails and process them
    """
    try:
        # Process emails in background
        background_tasks.add_task(email_service.process_new_emails, max_emails)
        
        return {
            "status": "processing",
            "message": f"Email check initiated. Processing up to {max_emails} emails."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emails/process")
async def process_emails(
    background_tasks: BackgroundTasks,
    email_service: EmailService = Depends(get_email_service)
):
    """Process new emails (Alias for check_emails)"""
    try:
        background_tasks.add_task(email_service.process_new_emails, 50)
        return {
            "status": "processing",
            "message": "Email processing initiated"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/emails/", response_model=List[EmailResponse])
async def get_emails(
    category: Optional[str] = Query(None, description="Filter by category: all, shipping, query, spam"),
    is_shipping_request: Optional[bool] = None,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get all emails with optional filters"""
    email_service = EmailService(db)
    
    # Use the service method with category support
    emails = email_service.get_all_emails(
        category=category,
        skip=offset,
        limit=limit
    )
    
    # --- SERVER SIDE DEBUGGING LOGS ---
    # These logs verify that the backend is correctly fetching nested data before sending it.
    try:
        count = 0
        for e in emails[:10]: # Check first 10 for efficiency
            if e.responses and len(e.responses) > 0:
                count += 1
                print(f"[DEBUG] Email {e.id} has {len(e.responses)} nested responses", flush=True)
        if count > 0:
            print(f"[DEBUG] Found {count} emails with replies in this batch", flush=True)
    except Exception as e:
        print(f"[DEBUG ERROR] {e}", flush=True)
    
    return emails


@router.get("/emails/{email_id}", response_model=EmailResponse)
async def get_email(
    email_id: int,
    email_service: EmailService = Depends(get_email_service)
):
    """Get email by ID"""
    email = email_service.get_email_by_id(email_id)
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    return email


@router.post("/emails/{email_id}/reply")
async def reply_to_email(
    email_id: int,
    reply_data: EmailReplyRequest,
    email_service: EmailService = Depends(get_email_service)
):
    """
    Manually reply to a specific email.
    Used for handling Queries/Inquiries directly from the dashboard.
    """
    email = email_service.get_email_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
        
    try:
        # 1. Send the response using the service
        response = email_service.send_response_email(
            email=email,
            message=reply_data.content,
            response_type="manual_reply"
        )
        
        if not response:
            raise HTTPException(status_code=500, detail="Failed to send email via SMTP")
            
        # 2. Force update status to 'completed'
        email.status = "completed"
        email.updated_at = datetime.utcnow()
        
        # 3. CRITICAL: Commit explicitly
        email_service.db.commit()
        
        # 4. Refresh to load relationships
        email_service.db.refresh(email)
        
        # 5. IMPORTANT: Return the full updated email with responses
        from app.models.schemas import EmailResponse
        
        print(f"[DEBUG] Reply created. Email now has {len(email.responses)} responses", flush=True)
        
        return {
            "success": True,
            "messageId": response.response_message_id,
            "email": EmailResponse.model_validate(email)  # Return full email
        }
    except Exception as e:
        email_service.db.rollback()
        print(f"[ERROR] Failed to reply: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 4. SHIPMENT / SESSION ENDPOINTS
# ==========================================

@router.get("/sessions/", response_model=List[ShipmentSessionResponse])
async def get_sessions(
    status: Optional[str] = None,
    vendor_id: Optional[int] = None,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Get all shipment sessions with optional filters.
    Includes sorting by newest first.
    """
    query = db.query(ShipmentSession)
    
    if status:
        query = query.filter(ShipmentSession.status == status)
    if vendor_id:
        query = query.filter(ShipmentSession.vendor_id == vendor_id)
    
    # Sort Sessions descending
    sessions = query.order_by(ShipmentSession.created_at.desc()).offset(offset).limit(limit).all()
    return sessions


@router.post("/sessions/", response_model=ShipmentSessionResponse)
async def create_session_manual(
    session_data: ShipmentSessionCreate,
    email_service: EmailService = Depends(get_email_service),
    db: Session = Depends(get_db)
):
    """
    Create a shipment session manually (Convert Query to Shipment).
    If a session already exists for the email, UPDATE it instead of creating a new one.
    """
    # 1. Check if session already exists
    existing_session = db.query(ShipmentSession).filter(
        ShipmentSession.email_id == session_data.email_id
    ).first()

    # Prepare data
    extracted_data = session_data.model_dump(exclude={'email_id'})
    required = ['sender_name', 'package_description']
    missing = [field for field in required if not extracted_data.get(field)]
    is_complete = len(missing) == 0

    if existing_session:
        # UPDATE EXISTING
        try:
            # Use the service helper to update fields intelligently
            email_service._update_existing_shipment(existing_session, {"extracted_info": extracted_data})
            
            # Explicitly update status if complete, as the helper focuses on fields
            if is_complete:
                existing_session.status = ShipmentStatus.COMPLETE
                existing_session.completed_at = datetime.utcnow()
                db.commit()
                
            db.refresh(existing_session)
            return existing_session
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update session: {str(e)}")

    # CREATE NEW
    email = email_service.get_email_by_id(session_data.email_id)
    if not email:
        raise HTTPException(status_code=404, detail="Original email not found")

    try:
        session = email_service.create_shipment_session(
            email=email,
            extracted_info=extracted_data,
            missing_fields=missing,
            is_complete=is_complete
        )
        return session
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@router.get("/sessions/{session_id}", response_model=ShipmentSessionResponse)
async def get_session(
    session_id: int, 
    db: Session = Depends(get_db)
):
    """Get session by ID"""
    session = db.query(ShipmentSession).filter(ShipmentSession.id == session_id).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session


@router.post("/sessions/{session_id}/assign", response_model=ShipmentSessionResponse)
async def assign_vendor(
    session_id: int, 
    data: dict, 
    db: Session = Depends(get_db)
):
    """Assign vendor to session"""
    try:
        session = db.query(ShipmentSession).filter(ShipmentSession.id == session_id).first()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        vendor_id = data.get("vendor_id")
        vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
        
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        
        print(f"[VENDOR ASSIGNMENT] Assigning vendor {vendor.name} (email: {vendor.email}) to session #{session_id}", flush=True)
        
        session.vendor_id = vendor_id
        session.vendor_notified_at = datetime.utcnow()
        
        # Update status to indicate waiting for vendor if it was just incomplete
        if session.status == ShipmentStatus.INCOMPLETE:
             session.status = ShipmentStatus.PENDING_INFO 
             
        db.commit()
        db.refresh(session)
        
        # Send notification email to vendor
        if vendor.email:
            try:
                print(f"[VENDOR NOTIFICATION] Preparing email to: {vendor.email}", flush=True)
                email_body = _generate_vendor_notification(session, vendor)
                print(f"[VENDOR NOTIFICATION] Email body generated, sending...", flush=True)
                result = smtp_service.send_email(
                    to_email=vendor.email,
                    subject=f"New Shipment Assignment - {session.id}",
                    body=email_body
                )
                print(f"[VENDOR NOTIFICATION] Send result: {result}", flush=True)
            except Exception as e:
                print(f"[VENDOR NOTIFICATION] Error: {str(e)}", flush=True)
        else:
            print(f"[VENDOR NOTIFICATION] Vendor {vendor.name} has no email", flush=True)
        
        return session
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to assign vendor: {str(e)}")


@router.put("/sessions/{session_id}/status", response_model=ShipmentSessionResponse)
async def update_session_status(
    session_id: int, 
    status_update: SessionStatusUpdate, 
    db: Session = Depends(get_db)
):
    """Update session status"""
    session = db.query(ShipmentSession).filter(ShipmentSession.id == session_id).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.status = status_update.status
    db.commit()
    db.refresh(session)
    return session


# ==========================================
# 5. LEGACY / SPECIFIC LIST ENDPOINTS
# ==========================================

@router.get("/shipments", response_model=List[ShipmentSessionResponse])
async def list_shipments(
    status: Optional[ShipmentStatusEnum] = None,
    limit: int = 100,
    email_service: EmailService = Depends(get_email_service)
):
    """
    List shipment sessions with optional status filter.
    Legacy alias for /sessions/
    """
    status_filter = ShipmentStatus(status.value) if status else None
    shipments = email_service.get_shipment_sessions(status=status_filter, limit=limit)
    
    return shipments


@router.get("/shipments/{shipment_id}", response_model=ShipmentSessionResponse)
async def get_shipment_legacy(
    shipment_id: int,
    email_service: EmailService = Depends(get_email_service)
):
    """Get shipment session by ID (Legacy alias)"""
    shipment = email_service.get_shipment_by_id(shipment_id)
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    return shipment


@router.get("/shipments/incomplete/list", response_model=List[ShipmentSessionResponse])
async def list_incomplete_shipments(
    limit: int = 100,
    email_service: EmailService = Depends(get_email_service)
):
    """List all incomplete shipments"""
    shipments = email_service.get_shipment_sessions(
        status=ShipmentStatus.INCOMPLETE,
        limit=limit
    )
    return shipments


@router.get("/shipments/complete/list", response_model=List[ShipmentSessionResponse])
async def list_complete_shipments(
    limit: int = 100,
    email_service: EmailService = Depends(get_email_service)
):
    """List all complete shipments"""
    shipments = email_service.get_shipment_sessions(
        status=ShipmentStatus.COMPLETE,
        limit=limit
    )
    return shipments


# ==========================================
# 6. VENDOR ENDPOINTS
# ==========================================

@router.get("/vendors", response_model=List[VendorResponse])
async def get_vendors(
    vendor_type: Optional[str] = None,
    active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Get all vendors with optional filters"""
    query = db.query(Vendor)
    
    if vendor_type:
        query = query.filter(Vendor.vendor_type == vendor_type)
    if active is not None:
        query = query.filter(Vendor.active == active)
    
    vendors = query.all()
    return vendors


@router.get("/vendors/search", response_model=List[VendorResponse])
async def search_vendors(
    query: str,
    vendor_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Search vendors"""
    search_query = db.query(Vendor).filter(
        (Vendor.name.ilike(f"%{query}%")) |
        (Vendor.email.ilike(f"%{query}%")) |
        (Vendor.company.ilike(f"%{query}%"))
    )
    
    if vendor_type:
        search_query = search_query.filter(Vendor.vendor_type == vendor_type)
    
    vendors = search_query.all()
    return vendors


@router.get("/vendors/{vendor_id}", response_model=VendorResponse)
async def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Get vendor by ID"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@router.post("/vendors", response_model=VendorResponse)
async def create_vendor(vendor_data: VendorCreate, db: Session = Depends(get_db)):
    """Create a new vendor"""
    vendor = Vendor(**vendor_data.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.put("/vendors/{vendor_id}", response_model=VendorResponse)
async def update_vendor(vendor_id: int, vendor_data: VendorUpdate, db: Session = Depends(get_db)):
    """Update a vendor"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    for key, value in vendor_data.model_dump(exclude_unset=True).items():
        setattr(vendor, key, value)
    
    db.commit()
    db.refresh(vendor)
    return vendor


@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Delete a vendor"""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    db.delete(vendor)
    db.commit()
    return {"status": "success", "message": "Vendor deleted"}


# ==========================================
# 7. SYSTEM / DASHBOARD ENDPOINTS
# ==========================================

@router.get("/outlook/authenticate")
async def authenticate_email():
    """Authenticate with email service"""
    try:
        success = smtp_service.authenticate()
        if success:
            return {"status": "success", "message": "Email authentication successful"}
        else:
            raise HTTPException(status_code=500, detail="Authentication failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    total_emails = db.query(Email).count()
    
    shipping_requests = 0
    try:
        shipping_requests = db.query(Email).filter(Email.category == EmailCategory.SHIPPING_REQUEST).count()
    except:
        pass
        
    total_shipments = db.query(ShipmentSession).count()
    complete_shipments = db.query(ShipmentSession).filter(ShipmentSession.status == ShipmentStatus.COMPLETE).count()
    incomplete_shipments = db.query(ShipmentSession).filter(ShipmentSession.status != ShipmentStatus.COMPLETE).count()
    vendor_replied_sessions = db.query(ShipmentSession).filter(ShipmentSession.vendor_replied_at.isnot(None)).count()

    return {
        "total_emails": total_emails,
        "shipping_requests": shipping_requests,
        "total_shipments": total_shipments,
        "complete_shipments": complete_shipments,
        "incomplete_shipments": incomplete_shipments,
        "vendor_replied_sessions": vendor_replied_sessions
    }


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Email Vendor Agent"}