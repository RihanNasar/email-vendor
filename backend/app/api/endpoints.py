from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.models.database import get_db
from app.models.schemas import (
    EmailResponse,
    ShipmentSessionResponse,
    ShipmentStatusEnum,
    VendorResponse,
    VendorCreate,
    VendorUpdate
)
from app.models.models import ShipmentStatus, Email, ShipmentSession, Vendor, EmailCategory
from app.services.smtp_service import smtp_service
from app.services.email_service import EmailService


router = APIRouter()


def _generate_vendor_notification(session: ShipmentSession, vendor: Vendor) -> str:
    """Generate a casual, human-like notification email for vendor"""
    
    # Build the message casually
    message = f"Hey {vendor.name.split()[0] if vendor.name else 'there'},\n\n"
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
    
    message += f"\n"
    
    # Closing
    message += "Can you take a look and let us know if you can handle this one? "
    message += "Just hit reply or give us a call if you need any more details.\n\n"
    message += "Thanks!\n"
    
    return message


def get_email_service(db: Session = Depends(get_db)) -> EmailService:
    """Dependency for Email service"""
    return EmailService(db)


@router.post("/emails/check", response_model=dict)
async def check_emails(
    background_tasks: BackgroundTasks,
    max_emails: int = 50,
    email_service: EmailService = Depends(get_email_service)
):
    """
    Check for new unread emails and process them
    
    This endpoint triggers the email monitoring and processing workflow:
    1. Fetch unread emails from Gmail
    2. Classify each email
    3. Extract shipping information
    4. Validate completeness
    5. Send appropriate responses
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


@router.get("/shipments", response_model=List[ShipmentSessionResponse])
async def list_shipments(
    status: Optional[ShipmentStatusEnum] = None,
    limit: int = 100,
    email_service: EmailService = Depends(get_email_service)
):
    """
    List shipment sessions with optional status filter
    
    Args:
        status: Filter by shipment status (incomplete, pending_info, complete, created)
        limit: Maximum number of results
    """
    status_filter = ShipmentStatus(status.value) if status else None
    shipments = email_service.get_shipment_sessions(status=status_filter, limit=limit)
    
    return shipments


@router.get("/shipments/{shipment_id}", response_model=ShipmentSessionResponse)
async def get_shipment(
    shipment_id: int,
    email_service: EmailService = Depends(get_email_service)
):
    """Get shipment session by ID"""
    shipment = email_service.get_shipment_by_id(shipment_id)
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    return shipment


@router.get("/shipments/incomplete/list", response_model=List[ShipmentSessionResponse])
async def list_incomplete_shipments(
    limit: int = 100,
    email_service: EmailService = Depends(get_email_service)
):
    """List all incomplete shipments that need additional information"""
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
    """List all complete shipments ready for processing"""
    shipments = email_service.get_shipment_sessions(
        status=ShipmentStatus.COMPLETE,
        limit=limit
    )
    
    return shipments


@router.get("/outlook/authenticate")
async def authenticate_email():
    """
    Authenticate with email service (SMTP/IMAP)
    
    For SMTP, this verifies the connection to both IMAP and SMTP servers.
    """
    try:
        success = smtp_service.authenticate()
        
        if success:
            return {"status": "success", "message": "Email authentication successful"}
        else:
            raise HTTPException(status_code=500, detail="Authentication failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Dashboard Stats endpoint
@router.get("/dashboard/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    from app.models.models import Email, ShipmentSession, EmailCategory, ShipmentStatus
    
    total_emails = db.query(Email).count()
    shipping_requests = db.query(Email).filter(Email.category == EmailCategory.SHIPPING_REQUEST).count() if hasattr(EmailCategory, 'SHIPPING_REQUEST') else 0
    total_shipments = db.query(ShipmentSession).count()
    complete_shipments = db.query(ShipmentSession).filter(ShipmentSession.status == ShipmentStatus.COMPLETE).count()
    incomplete_shipments = db.query(ShipmentSession).filter(ShipmentSession.status != ShipmentStatus.COMPLETE).count()

    return {
        "total_emails": total_emails,
        "shipping_requests": shipping_requests,
        "total_shipments": total_shipments,
        "complete_shipments": complete_shipments,
        "incomplete_shipments": incomplete_shipments
    }


# Vendors endpoints
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


# Sessions/Shipments endpoints
@router.get("/sessions/", response_model=List[ShipmentSessionResponse])
async def get_sessions(
    status: Optional[str] = None,
    vendor_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get all shipment sessions with optional filters"""
    query = db.query(ShipmentSession)
    
    if status:
        query = query.filter(ShipmentSession.status == status)
    if vendor_id:
        query = query.filter(ShipmentSession.vendor_id == vendor_id)
    
    sessions = query.all()
    return sessions


@router.get("/sessions/{session_id}", response_model=ShipmentSessionResponse)
async def get_session(session_id: int, db: Session = Depends(get_db)):
    """Get session by ID"""
    session = db.query(ShipmentSession).filter(ShipmentSession.id == session_id).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session


@router.post("/sessions/{session_id}/assign", response_model=ShipmentSessionResponse)
async def assign_vendor(session_id: int, data: dict, db: Session = Depends(get_db)):
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
        db.commit()
        db.refresh(session)
        
        print(f"[VENDOR ASSIGNMENT] Session #{session_id} updated: vendor_id={session.vendor_id}, vendor_notified_at={session.vendor_notified_at}", flush=True)
        
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


@router.patch("/sessions/{session_id}/status", response_model=ShipmentSessionResponse)
async def update_session_status(session_id: int, data: dict, db: Session = Depends(get_db)):
    """Update session status"""
    session = db.query(ShipmentSession).filter(ShipmentSession.id == session_id).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.status = data.get("status")
    db.commit()
    db.refresh(session)
    return session


# Emails endpoints
@router.get("/emails/", response_model=List[EmailResponse])
async def get_emails(
    is_shipping_request: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Get all emails with optional filters"""
    query = db.query(Email)
    
    if is_shipping_request is not None:
        query = query.filter(Email.is_shipping_request == is_shipping_request)
    
    emails = query.all()
    return emails


@router.get("/emails/{email_id}", response_model=EmailResponse)
async def get_email(email_id: int, db: Session = Depends(get_db)):
    """Get email by ID"""
    email = db.query(Email).filter(Email.id == email_id).first()
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    return email


@router.post("/emails/process")
async def process_emails(
    background_tasks: BackgroundTasks,
    email_service: EmailService = Depends(get_email_service)
):
    """Process new emails"""
    try:
        background_tasks.add_task(email_service.process_new_emails, 50)
        
        return {
            "status": "processing",
            "message": "Email processing initiated"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/outlook/authenticate")
async def authenticate_outlook():
    """
    Authenticate with email service (SMTP/IMAP)
    
    For SMTP, this verifies the connection to both IMAP and SMTP servers.
    Note: Outlook OAuth is not currently implemented - using SMTP/IMAP instead.
    """
    try:
        success = smtp_service.authenticate()
        
        if success:
            return {"status": "success", "message": "Email authentication successful"}
        else:
            raise HTTPException(status_code=500, detail="Authentication failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Email Vendor Agent"}


@router.get("/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get system statistics"""
    from app.models.models import Email, ShipmentSession, EmailCategory, ShipmentStatus
    
    total_emails = db.query(Email).count()
    shipping_requests = db.query(Email).filter(
        Email.category == EmailCategory.SHIPPING_REQUEST
    ).count()
    
    total_shipments = db.query(ShipmentSession).count()
    complete_shipments = db.query(ShipmentSession).filter(
        ShipmentSession.status == ShipmentStatus.COMPLETE
    ).count()
    incomplete_shipments = db.query(ShipmentSession).filter(
        ShipmentSession.status == ShipmentStatus.INCOMPLETE
    ).count()
    
    return {
        "total_emails": total_emails,
        "shipping_requests": shipping_requests,
        "total_shipments": total_shipments,
        "complete_shipments": complete_shipments,
        "incomplete_shipments": incomplete_shipments
    }
