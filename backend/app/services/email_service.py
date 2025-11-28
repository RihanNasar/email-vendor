from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional, Dict, Any
import re

from app.models.models import (
    Email, ShipmentSession, EmailResponse, AgentLog, Vendor,
    EmailStatus, EmailCategory, ShipmentStatus
)
from app.models.schemas import EmailCreate, EmailCategoryEnum
from app.services.smtp_service import smtp_service
from app.services.query_service import QueryService
from app.agents.graph import email_agent
from app.config import settings


class EmailService:
    """Service for managing email processing and storage"""
    
    def __init__(self, db: Session):
        self.db = db
        self.email_service = smtp_service
        self.query_service = QueryService(db)
    
    def get_all_emails(self, skip: int = 0, limit: int = 100) -> List[Email]:
        """
        Get all emails sorted by NEWEST first.
        """
        return (
            self.db.query(Email)
            .order_by(Email.received_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def find_related_emails_by_thread(self, thread_id: str) -> List[Email]:
        """Find all emails in the same thread"""
        return self.db.query(Email).filter(Email.thread_id == thread_id).all()
    
    def find_related_emails_by_message_ids(self, message_ids: List[str]) -> List[Email]:
        """Find emails matching any of the given message IDs"""
        if not message_ids:
            return []
        return self.db.query(Email).filter(Email.message_id.in_(message_ids)).all()
    
    def process_new_emails(self, max_emails: int = 50) -> List[Email]:
        """
        Fetch and process new unread emails
        """
        messages = self.email_service.get_unread_messages(max_results=max_emails)
        
        processed_emails = []
        
        for msg_data in messages:
            # Check if email already exists
            existing = self.db.query(Email).filter(
                Email.message_id == msg_data['id']
            ).first()
            
            if existing:
                print(f"[PROCESS] Email {msg_data['id']} already processed, skipping", flush=True)
                continue
            
            # Check thread relationships
            thread_emails = self.find_related_emails_by_thread(msg_data['thread_id'])
            related_emails = self.find_related_emails_by_message_ids(msg_data.get('related_message_ids', []))
            
            print(f"[THREAD TRACKING] Found {len(thread_emails)} emails in same thread", flush=True)
            print(f"[THREAD TRACKING] Found {len(related_emails)} related emails by message IDs", flush=True)
            
            # Check if this is a vendor reply
            vendor_reply = self.check_vendor_reply(msg_data)
            if vendor_reply:
                processed_emails.append(vendor_reply)
                continue
            
            # Check if this is a sender replying with missing information
            missing_info_reply = self.check_missing_info_reply(msg_data)
            if missing_info_reply:
                processed_emails.append(missing_info_reply)
                continue
            
            # Create email record
            email = self.create_email(
                message_id=msg_data['id'],
                thread_id=msg_data['thread_id'],
                sender_email=msg_data['sender_email'],
                sender_name=msg_data['sender_name'],
                subject=msg_data['subject'],
                body=msg_data['body'],
                received_at=msg_data['internal_date']
            )
            
            # Store additional metadata
            email.is_forwarded = msg_data.get('is_forwarded', False)
            email.is_reply = msg_data.get('is_reply', False)
            
            # Process with agent, providing thread context
            self.process_email_with_agent(
                email, 
                thread_emails=thread_emails,
                related_emails=related_emails,
                is_shipping_related=msg_data.get('is_shipping_related', False)
            )
            
            processed_emails.append(email)
        
        return processed_emails
    
    def create_email(
        self,
        message_id: str,
        sender_email: str,
        subject: str,
        body: str,
        received_at: datetime,
        thread_id: Optional[str] = None,
        sender_name: Optional[str] = None
    ) -> Email:
        """Create a new email record in the database, or return existing if duplicate"""
        from sqlalchemy.exc import IntegrityError
        
        email = Email(
            message_id=message_id,
            thread_id=thread_id,
            sender_email=sender_email,
            sender_name=sender_name,
            subject=subject,
            body=body,
            received_at=received_at,
            status=EmailStatus.UNPROCESSED
        )
        
        try:
            self.db.add(email)
            self.db.commit()
            self.db.refresh(email)
            print(f"[EMAIL CREATED] ID: {email.id}, Thread: {thread_id}", flush=True)
            return email
        except IntegrityError as e:
            self.db.rollback()
            existing = self.db.query(Email).filter(Email.message_id == message_id).first()
            if existing:
                print(f"[EMAIL] Duplicate message_id {message_id}, returning existing email.", flush=True)
                return existing
            else:
                raise e

    def _is_shipping_heuristic(self, subject: str, body: str) -> bool:
        """
        Hard rule check to catch Shipping Requests that AI might miss due to formatting.
        Updated to catch Forwarding and Airport Codes.
        """
        keywords = [
            r"request for (?:rate|quote|quotation)",
            r"freight quote",
            r"shipping request",
            r"customs clearance",
            r"container",
            r"reefer",
            r"commodity:",
            r"door to door",
            r"\bist\b", r"\bruh\b", r"\bdxb\b", r"\blhr\b", r"\bjed\b",
            r"fwd:", r"fw:" 
        ]
        
        combined_text = (subject + " " + body).lower()
        
        for pattern in keywords:
            if re.search(pattern, combined_text):
                return True
        return False
    
    def process_email_with_agent(
        self, 
        email: Email, 
        thread_emails: List[Email] = None,
        related_emails: List[Email] = None,
        is_shipping_related: bool = False
    ) -> Dict[str, Any]:
        """
        Process email using the LangGraph agent with thread context.
        Handles Routing: Shipping vs Query vs Spam.
        """
        try:
            email.status = EmailStatus.PROCESSING
            self.db.commit()
            
            # Prepare thread context for agent
            thread_context = []
            if thread_emails:
                for te in thread_emails:
                    thread_context.append({
                        'email_id': te.id,
                        'subject': te.subject,
                        'sender_email': te.sender_email,
                        'body': te.body[:500],
                        'category': te.category.value if te.category else None,
                        'is_shipping_request': te.is_shipping_request
                    })
            
            # Check heuristics
            heuristic_shipping = self._is_shipping_heuristic(email.subject, email.body)
            final_is_shipping_related = is_shipping_related or heuristic_shipping

            # Prepare email data for agent
            email_data = {
                "email_id": email.id,
                "message_id": email.message_id,
                "thread_id": email.thread_id,
                "sender_email": email.sender_email,
                "sender_name": email.sender_name,
                "subject": email.subject,
                "body": email.body,
                "received_at": email.received_at,
                "thread_context": thread_context,
                "is_shipping_related": final_is_shipping_related,
                "is_forwarded": getattr(email, 'is_forwarded', False),
                "is_reply": getattr(email, 'is_reply', False)
            }
            
            print(f"[AGENT PROCESSING] Email ID: {email.id}", flush=True)
            
            # Process with agent
            result = email_agent.process_email(email_data)
            
            # Determine Category
            category_str = result['category']
            
            # --- ROUTING LOGIC ---
            
            # 1. SPAM
            if category_str == "spam":
                email.category = EmailCategory.OTHER # Or dedicated SPAM enum if available
                email.status = EmailStatus.IGNORED
                email.is_shipping_request = False
                print(f"[ROUTER] Email #{email.id} classified as SPAM. Ignoring.", flush=True)
                
            # 2. QUERY (General Question)
            elif category_str == "query":
                email.category = EmailCategory.LOGISTICS_INQUIRY
                email.is_shipping_request = False
                print(f"[ROUTER] Email #{email.id} classified as QUERY. Sending to QueryService.", flush=True)
                self.query_service.process_query(email)
                
            # 3. SHIPPING REQUEST
            elif result['is_shipping_request'] or category_str == "shipping_request" or (heuristic_shipping and category_str == "other"):
                print(f"[ROUTER] Email #{email.id} classified as SHIPPING REQUEST.", flush=True)
                email.category = EmailCategory.SHIPPING_REQUEST
                email.is_shipping_request = True
                self._handle_shipping_request(email, result)
            
            # 4. OTHER
            else:
                email.category = EmailCategory.OTHER
                email.is_shipping_request = False
                email.status = EmailStatus.COMPLETED
                print(f"[ROUTER] Email #{email.id} classified as OTHER.", flush=True)

            # Log agent actions
            for log in result.get('agent_logs', []):
                self.create_agent_log(
                    email_id=email.id,
                    agent_step=log['step'],
                    input_data={"email_id": email.id},
                    output_data=log['result'],
                    decision=str(log['result'])
                )
            
            email.processed_at = datetime.utcnow()
            self.db.commit()
            
            # Mark as read
            self.email_service.mark_as_read(email.message_id)
            
            return {
                "success": True,
                "email_id": email.id,
                "category": email.category.value,
            }
            
        except Exception as e:
            self.db.rollback()
            email.status = EmailStatus.FAILED
            email.error_message = str(e)
            try:
                self.db.commit()
            except:
                self.db.rollback()
            
            print(f"[ERROR] Processing email {email.id}: {str(e)}", flush=True)
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "email_id": email.id,
                "error": str(e)
            }

    def _handle_shipping_request(self, email: Email, result: Dict[str, Any]):
        """Helper to handle the creation/update logic for shipping requests"""
        
        # 1. EXTRACT regex fields
        simple_extracted = self._extract_simple_fields(email.body)
        
        # 2. EXTRACT AI fields
        agent_extracted = result.get('extracted_info', {})
        
        # 3. MERGE STRATEGY: AI TAKES PRIORITY
        merged_info = {**simple_extracted, **agent_extracted}
        
        print(f"[MERGE] Regex found: {list(simple_extracted.keys())}")
        print(f"[MERGE] AI found: {list(agent_extracted.keys())}")
        
        # Check if there's already a shipment for this thread
        existing_shipment = self.db.query(ShipmentSession).filter(
            ShipmentSession.thread_id == email.thread_id
        ).first()
        
        if existing_shipment:
            print(f"[SHIPMENT] Found existing shipment #{existing_shipment.id} for thread {email.thread_id}", flush=True)
            self._update_existing_shipment(existing_shipment, {"extracted_info": merged_info})
        else:
            print(f"[SHIPMENT] Creating new shipment for thread {email.thread_id}", flush=True)
            shipment_session = self.create_shipment_session(
                email=email,
                extracted_info=merged_info,
                missing_fields=result['missing_fields'],
                is_complete=result['is_complete']
            )
        
        # Send response email
        if result.get('response_message'):
            self.send_response_email(
                email=email,
                message=result['response_message'],
                response_type="missing_info" if not result['is_complete'] else "confirmation",
                missing_fields=result['missing_fields']
            )
        
        email.status = EmailStatus.COMPLETED

    def _update_existing_shipment(self, shipment: ShipmentSession, result: Dict[str, Any]):
        """Update existing shipment with new information from forwarded/reply emails"""
        extracted = result.get('extracted_info', {})
        
        # Update fields logic: Append descriptions, overwrite others
        for field, value in extracted.items():
            if value:
                current_value = getattr(shipment, field, None)
                
                if field == 'package_description' and current_value:
                    if value.lower() not in current_value.lower():
                        new_desc = f"{current_value} + {value}"
                        setattr(shipment, field, new_desc)
                        print(f"[SHIPMENT UPDATE] Appended {field}: {new_desc}", flush=True)
                else:
                    setattr(shipment, field, value)
                    print(f"[SHIPMENT UPDATE] Updated {field} with value: {value}", flush=True)
        
        # Recalculate missing fields
        required_fields = ['package_description']
        if not (shipment.sender_city or shipment.sender_address): required_fields.append('sender_city')
        if not (shipment.recipient_city or shipment.recipient_address): required_fields.append('recipient_city')
        
        missing = [f for f in required_fields if not getattr(shipment, f, None)]
        shipment.missing_fields = missing
        
        if not missing:
            shipment.status = ShipmentStatus.COMPLETE
            shipment.completed_at = datetime.now()
        
        shipment.updated_at = datetime.now()
        self.db.commit()
    
    def create_shipment_session(
        self,
        email: Email,
        extracted_info: Dict[str, Any],
        missing_fields: List[str],
        is_complete: bool
    ) -> ShipmentSession:
        """Create a shipment session from extracted information"""
        
        status = ShipmentStatus.COMPLETE if is_complete else ShipmentStatus.INCOMPLETE
        
        shipment = ShipmentSession(
            email_id=email.id,
            thread_id=email.thread_id,
            subject=email.subject,
            sender_name=extracted_info.get('sender_name'),
            sender_address=extracted_info.get('sender_address'),
            sender_city=extracted_info.get('sender_city'),
            sender_state=extracted_info.get('sender_state'),
            sender_zipcode=extracted_info.get('sender_zipcode'),
            sender_country=extracted_info.get('sender_country'),
            sender_phone=extracted_info.get('sender_phone'),
            recipient_name=extracted_info.get('recipient_name'),
            recipient_address=extracted_info.get('recipient_address'),
            recipient_city=extracted_info.get('recipient_city'),
            recipient_state=extracted_info.get('recipient_state'),
            recipient_zipcode=extracted_info.get('recipient_zipcode'),
            recipient_country=extracted_info.get('recipient_country'),
            recipient_phone=extracted_info.get('recipient_phone'),
            package_weight=extracted_info.get('package_weight'),
            package_dimensions=extracted_info.get('package_dimensions'),
            package_description=extracted_info.get('package_description'),
            package_value=extracted_info.get('package_value'),
            service_type=extracted_info.get('service_type'),
            status=status,
            missing_fields=missing_fields,
            extracted_data=extracted_info,
            completed_at=datetime.utcnow() if is_complete else None
        )
        
        self.db.add(shipment)
        self.db.commit()
        self.db.refresh(shipment)
        
        print(f"[SHIPMENT CREATED] ID: {shipment.id}, Status: {status}, Missing: {missing_fields}", flush=True)
        
        return shipment
    
    def send_response_email(
        self,
        email: Email,
        message: str,
        response_type: str,
        missing_fields: Optional[List[str]] = None
    ) -> Optional[EmailResponse]:
        """Send a response email"""
        
        subject = f"Re: {email.subject}"
        
        sent_message_id = self.email_service.send_reply(
            to_email=email.sender_email,
            subject=subject,
            body=message,
            in_reply_to=email.message_id,
            references=email.thread_id
        )
        
        if sent_message_id:
            response = EmailResponse(
                email_id=email.id,
                response_message_id=sent_message_id,
                subject=subject,
                body=message,
                response_type=response_type,
                missing_fields_requested=missing_fields or []
            )
            
            self.db.add(response)
            self.db.commit()
            self.db.refresh(response)
            
            print(f"[RESPONSE SENT] To: {email.sender_email}, Type: {response_type}", flush=True)
            
            return response
        
        return None
    
    def create_agent_log(
        self,
        email_id: int,
        agent_step: str,
        input_data: Dict[str, Any],
        output_data: Dict[str, Any],
        decision: str
    ) -> AgentLog:
        """Create an agent log entry"""
        
        log = AgentLog(
            email_id=email_id,
            agent_step=agent_step,
            input_data=input_data,
            output_data=output_data,
            decision=decision
        )
        
        self.db.add(log)
        return log
    
    def get_shipment_sessions(
        self,
        status: Optional[ShipmentStatus] = None,
        limit: int = 100
    ) -> List[ShipmentSession]:
        """Get shipment sessions with optional status filter"""
        
        query = self.db.query(ShipmentSession)
        
        if status:
            query = query.filter(ShipmentSession.status == status)
        
        return query.order_by(ShipmentSession.created_at.desc()).limit(limit).all()
    
    def get_email_by_id(self, email_id: int) -> Optional[Email]:
        """Get email by ID"""
        return self.db.query(Email).filter(Email.id == email_id).first()
    
    def check_vendor_reply(self, msg_data: Dict[str, Any]) -> Optional[Email]:
        """Check if this email is a vendor reply and log it"""
        sender_email = msg_data['sender_email']
        
        print(f"[VENDOR CHECK] Checking if email from {sender_email} is a vendor reply", flush=True)
        
        vendor = self.db.query(Vendor).filter(Vendor.email == sender_email).first()
        if not vendor:
            print(f"[VENDOR CHECK] {sender_email} is not a registered vendor", flush=True)
            return None
        
        print(f"[VENDOR CHECK] Found vendor: {vendor.name} (ID: {vendor.id})", flush=True)
        
        session = self.db.query(ShipmentSession).filter(
            ShipmentSession.vendor_id == vendor.id,
            ShipmentSession.vendor_replied_at == None,
            ShipmentSession.vendor_notified_at != None
        ).order_by(ShipmentSession.vendor_notified_at.desc()).first()
        
        if not session:
            print(f"[VENDOR CHECK] No pending sessions found for vendor {vendor.name}", flush=True)
            return None
        
        print(f"[VENDOR CHECK] Found session #{session.id} to update", flush=True)
        
        email = self.create_email(
            message_id=msg_data['id'],
            thread_id=msg_data['thread_id'],
            sender_email=sender_email,
            sender_name=msg_data['sender_name'],
            subject=msg_data['subject'],
            body=msg_data['body'],
            received_at=msg_data['internal_date']
        )
        
        email.category = EmailCategory.OTHER
        email.status = EmailStatus.COMPLETED
        
        session.vendor_replied_at = datetime.now()
        session.vendor_reply_message_id = email.message_id
        session.vendor_reply_content = msg_data['body']
        session.updated_at = datetime.now()
        
        self.db.commit()
        
        print(f"[VENDOR REPLY] Vendor {vendor.name} replied to session #{session.id}", flush=True)
        
        return email
    
    def _extract_simple_fields(self, body: str) -> Dict[str, Any]:
        """Simple extraction of fields from reply body using pattern matching"""
        import re
        
        extracted = {}
        
        patterns = {
            'sender_name': [
                r'sender\s+name\s*[:=]\s*(.+?)(?:\n|$)',
                r'from\s+name\s*[:=]\s*(.+?)(?:\n|$)',
                r'my\s+name\s+is\s+(.+?)(?:\n|$)',
            ],
            'sender_address': [
                r'sender\s+address\s*[:=]\s*(.+?)(?:\n|$)',
                r'pickup\s+address\s*[:=]\s*(.+?)(?:\n|$)',
                r'from\s+address\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'sender_city': [
                r'sender\s+city\s*[:=]\s*(.+?)(?:\n|$)',
                r'pickup\s+city\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'sender_state': [
                r'sender\s+state\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'sender_zipcode': [
                r'sender\s+(?:zip|zipcode|postal)\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'sender_phone': [
                r'sender\s+phone\s*[:=]\s*(.+?)(?:\n|$)',
                r'phone\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'recipient_name': [
                r'recipient\s+name\s*[:=]\s*(.+?)(?:\n|$)',
                r'to\s+name\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'recipient_address': [
                r'recipient\s+address\s*[:=]\s*(.+?)(?:\n|$)',
                r'delivery\s+address\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'recipient_city': [
                r'recipient\s+city\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'package_description': [
                r'package\s+description\s*[:=]\s*(.+?)(?:\n|$)',
                r'description\s*[:=]\s*(.+?)(?:\n|$)',
            ],
        }
        
        body_lower = body.lower()
        
        for field, pattern_list in patterns.items():
            for pattern in pattern_list:
                match = re.search(pattern, body_lower, re.IGNORECASE | re.MULTILINE)
                if match:
                    value = match.group(1).strip()
                    start = match.start(1)
                    end = match.end(1)
                    original_value = body[start:end].strip()
                    extracted[field] = original_value
                    print(f"[SIMPLE EXTRACT] Found {field}: {original_value}", flush=True)
                    break
        
        return extracted
    
    def check_missing_info_reply(self, msg_data: Dict[str, Any]) -> Optional[Email]:
        """Check if this email is a reply from sender with missing information"""
        sender_email = msg_data['sender_email']
        thread_id = msg_data.get('thread_id')
        
        print(f"[MISSING INFO CHECK] Checking if email from {sender_email} is a missing info reply", flush=True)
        print(f"[MISSING INFO CHECK] Thread ID: {thread_id}", flush=True)
        
        # Try to match by thread_id first
        session = self.db.query(ShipmentSession).filter(
            ShipmentSession.thread_id == thread_id,
            # Removed status check to allow appending info to completed sessions
        ).order_by(ShipmentSession.created_at.desc()).first()
        
        # If not found, try subject matching
        if not session and msg_data.get('subject', '').lower().startswith('re:'):
            original_subject = msg_data.get('subject', '').lower().replace('re:', '').strip()
            session = self.db.query(ShipmentSession).filter(
                ShipmentSession.subject.ilike(f'%{original_subject}%')
            ).order_by(ShipmentSession.created_at.desc()).first()
        
        if not session:
            # Fallback: Try to find ANY session by thread_id
            session = self.db.query(ShipmentSession).filter(
                ShipmentSession.thread_id == thread_id
            ).order_by(ShipmentSession.created_at.desc()).first()

        if not session:
            print(f"[MISSING INFO CHECK] No matching session found. Not a missing info reply.", flush=True)
            return None
        
        print(f"[MISSING INFO CHECK] Found matching session #{session.id}", flush=True)
        
        # Check for duplicate
        existing_email = self.db.query(Email).filter(Email.message_id == msg_data['id']).first()
        if existing_email:
            print(f"[MISSING INFO CHECK] Email already exists, skipping creation", flush=True)
            email = existing_email
        else:
            email = self.create_email(
                message_id=msg_data['id'],
                thread_id=msg_data['thread_id'],
                sender_email=sender_email,
                sender_name=msg_data['sender_name'],
                subject=msg_data['subject'],
                body=msg_data['body'],
                received_at=msg_data['internal_date']
            )
        
        # Build email data with context
        email_data = {
            "email_id": email.id,
            "message_id": email.message_id,
            "thread_id": email.thread_id,
            "sender_email": email.sender_email,
            "sender_name": email.sender_name,
            "subject": email.subject,
            "body": email.body,
            "received_at": email.received_at,
            "is_follow_up": True,
            "missing_fields": session.missing_fields,
            "existing_session_data": {
                "sender_name": session.sender_name,
                "sender_address": session.sender_address,
                "sender_city": session.sender_city,
                "sender_state": session.sender_state,
                "sender_zipcode": session.sender_zipcode,
                "sender_country": session.sender_country,
                "sender_phone": session.sender_phone,
                "recipient_name": session.recipient_name,
                "recipient_address": session.recipient_address,
                "recipient_city": session.recipient_city,
                "recipient_state": session.recipient_state,
                "recipient_zipcode": session.recipient_zipcode,
                "recipient_country": session.recipient_country,
                "recipient_phone": session.recipient_phone,
                "package_description": session.package_description,
                "package_weight": session.package_weight,
                "package_dimensions": session.package_dimensions,
                "package_value": session.package_value,
                "service_type": session.service_type,
            }
        }
        
        try:
            # Extract using simple patterns
            simple_extracted = self._extract_simple_fields(msg_data['body'])
            print(f"[SIMPLE EXTRACT] Results: {simple_extracted}", flush=True)
            
            # Use agent for complex extraction
            result = email_agent.process_email(email_data)
            agent_extracted = result.get('extracted_info', {})
            print(f"[AGENT EXTRACT] Results: {agent_extracted}", flush=True)
            
            # MERGE Priority: Agent > Simple
            newly_extracted = {**simple_extracted, **agent_extracted}
            
            # Merge with existing session data (WITH PROTECTION LOGIC)
            for field in ['sender_name', 'sender_address', 'sender_city', 'sender_state', 
                          'sender_zipcode', 'sender_country', 'sender_phone',
                          'recipient_name', 'recipient_address', 'recipient_city', 
                          'recipient_state', 'recipient_zipcode', 'recipient_country', 
                          'recipient_phone', 'package_description', 'package_weight',
                          'package_dimensions', 'package_value', 'service_type']:
                
                current = getattr(session, field, None)
                new = newly_extracted.get(field)
                
                if new:
                    # 1. Package Description: Append
                    if field == 'package_description' and current:
                        if new.lower() not in current.lower():
                            updated_desc = f"{current} + {new}"
                            setattr(session, field, updated_desc)
                            print(f"[SESSION UPDATE] Appended to {field}: {updated_desc}", flush=True)
                    
                    # 2. PROTECT Location/Contact Info: Do NOT overwrite if existing
                    elif field in ['sender_city', 'sender_address', 'sender_country', 'sender_name',
                                   'recipient_city', 'recipient_address', 'recipient_country', 'recipient_name'] and current:
                         print(f"[SESSION PROTECT] Keeping existing {field}: {current}. Ignoring new value: {new}", flush=True)
                         pass
                    
                    # 3. Update everything else (or if current is empty)
                    elif new != current:
                        setattr(session, field, new)
                        print(f"[SESSION UPDATE] Updated {field} with new value", flush=True)
            
            # Recalculate missing fields
            required_fields = ['package_description']
            if not (session.sender_city or session.sender_address): required_fields.append('sender_city')
            if not (session.recipient_city or session.recipient_address): required_fields.append('recipient_city')
            
            actual_missing = [f for f in required_fields if not getattr(session, f, None)]
            session.missing_fields = actual_missing
            
            print(f"[MISSING INFO] Updated session #{session.id}, still missing: {actual_missing}", flush=True)
            
            # Update status if complete
            if not actual_missing:
                session.status = ShipmentStatus.COMPLETE
                session.completed_at = datetime.now()
                print(f"[MISSING INFO] Session #{session.id} is now complete!", flush=True)
            
            session.updated_at = datetime.now()
            session.missing_info_updated_at = datetime.now()
            
            email.category = EmailCategory.SHIPPING_REQUEST
            email.is_shipping_request = True
            email.status = EmailStatus.COMPLETED
            email.processed_at = datetime.now()
            
            # Send response
            if session.status == ShipmentStatus.COMPLETE:
                # Custom message if we just appended new items
                if newly_extracted.get('package_description') and " + " in str(getattr(session, 'package_description', '')):
                    response_message = (
                        "Received! We've added the new items to your shipment request. "
                        "We'll proceed with the updated details. Thanks! 😊"
                    )
                else:
                    response_message = (
                        "Thank you so much for providing the details! 😊 Your shipment request is confirmed. "
                        "We'll process it and get back to you soon!"
                    )
            elif actual_missing:
                readable_fields = [f.replace('_', ' ').title() for f in actual_missing]
                response_message = (
                    f"Thanks for your update! We still need:\n\n• " + 
                    "\n• ".join(readable_fields) +
                    "\n\nPlease reply with these details. Thanks! 😊"
                )
            else:
                response_message = "Thank you for your update! We've updated your shipment details."
            
            self.send_response_email(
                email=email,
                message=response_message,
                response_type="confirmation" if session.status == ShipmentStatus.COMPLETE else "missing_info",
                missing_fields=actual_missing
            )
            
            self.db.commit()
            self.email_service.mark_as_read(email.message_id)
            
            return email
            
        except Exception as e:
            print(f"[MISSING INFO ERROR] {str(e)}", flush=True)
            import traceback
            traceback.print_exc()
            self.db.rollback()
            return None

    def get_shipment_by_id(self, shipment_id: int) -> Optional[ShipmentSession]:
        """Get shipment session by ID"""
        return self.db.query(ShipmentSession).filter(ShipmentSession.id == shipment_id).first()