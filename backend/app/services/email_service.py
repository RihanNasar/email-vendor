from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional, Dict, Any

from app.models.models import (
    Email, ShipmentSession, EmailResponse, AgentLog, Vendor,
    EmailStatus, EmailCategory, ShipmentStatus
)
from app.models.schemas import EmailCreate
from app.services.smtp_service import smtp_service
from app.agents.graph import email_agent
from app.config import settings


class EmailService:
    """Service for managing email processing and storage"""
    
    def __init__(self, db: Session):
        self.db = db
        self.email_service = smtp_service
    
    def process_new_emails(self, max_emails: int = 50) -> List[Email]:
        """
        Fetch and process new unread emails
        
        Args:
            max_emails: Maximum number of emails to process
            
        Returns:
            List of processed Email objects
        """
        # Get unread messages from email service
        messages = self.email_service.get_unread_messages(max_results=max_emails)
        
        processed_emails = []
        
        for msg_data in messages:
            # Check if email already exists
            existing = self.db.query(Email).filter(
                Email.message_id == msg_data['id']
            ).first()
            
            if existing:
                continue
            
            # Check if this is a vendor reply to an assigned session
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
            
            # Process with agent
            self.process_email_with_agent(email)
            
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
            return email
        except IntegrityError as e:
            self.db.rollback()
            # If duplicate, fetch and return existing email
            existing = self.db.query(Email).filter(Email.message_id == message_id).first()
            if existing:
                print(f"[EMAIL] Duplicate message_id {message_id}, returning existing email.", flush=True)
                return existing
            else:
                raise e
    
    def process_email_with_agent(self, email: Email) -> Dict[str, Any]:
        """
        Process email using the LangGraph agent
        
        Args:
            email: Email object to process
            
        Returns:
            Processing results
        """
        try:
            # Update status
            email.status = EmailStatus.PROCESSING
            self.db.commit()
            
            # Prepare email data for agent
            email_data = {
                "email_id": email.id,
                "message_id": email.message_id,
                "thread_id": email.thread_id,
                "sender_email": email.sender_email,
                "sender_name": email.sender_name,
                "subject": email.subject,
                "body": email.body,
                "received_at": email.received_at
            }
            
            # Process with agent
            result = email_agent.process_email(email_data)
            
            # Update email with classification results
            email.category = EmailCategory(result['category'])
            email.is_shipping_request = result['is_shipping_request']
            email.status = EmailStatus.COMPLETED
            email.processed_at = datetime.utcnow()
            
            # Create shipment session if it's a shipping request
            if result['is_shipping_request']:
                shipment_session = self.create_shipment_session(
                    email=email,
                    extracted_info=result['extracted_info'],
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
            
            # Log agent actions
            for log in result.get('agent_logs', []):
                self.create_agent_log(
                    email_id=email.id,
                    agent_step=log['step'],
                    input_data={"email_id": email.id},
                    output_data=log['result'],
                    decision=str(log['result'])
                )
            
            self.db.commit()
            
            # Mark as read via email service
            self.email_service.mark_as_read(email.message_id)
            
            return {
                "success": True,
                "email_id": email.id,
                "category": email.category.value,
                "is_shipping_request": email.is_shipping_request,
                "is_complete": result.get('is_complete', False)
            }
            
        except Exception as e:
            self.db.rollback()
            email.status = EmailStatus.FAILED
            email.error_message = str(e)
            try:
                self.db.commit()
            except:
                self.db.rollback()
            
            return {
                "success": False,
                "email_id": email.id,
                "error": str(e)
            }
    
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
        
        # Send via email service (SMTP)
        sent_message_id = self.email_service.send_reply(
            to_email=email.sender_email,
            subject=subject,
            body=message,
            in_reply_to=email.message_id,
            references=email.thread_id
        )
        
        if sent_message_id:
            # Create response record
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
        subject = msg_data['subject']
        
        print(f"[VENDOR CHECK] Checking if email from {sender_email} is a vendor reply", flush=True)
        
        # Check if sender is a vendor
        vendor = self.db.query(Vendor).filter(Vendor.email == sender_email).first()
        if not vendor:
            print(f"[VENDOR CHECK] {sender_email} is not a registered vendor", flush=True)
            return None
        
        print(f"[VENDOR CHECK] Found vendor: {vendor.name} (ID: {vendor.id})", flush=True)
        
        # Find sessions assigned to this vendor that haven't received a reply yet
        session = self.db.query(ShipmentSession).filter(
            ShipmentSession.vendor_id == vendor.id,
            ShipmentSession.vendor_replied_at == None,
            ShipmentSession.vendor_notified_at != None
        ).order_by(ShipmentSession.vendor_notified_at.desc()).first()
        
        if not session:
            print(f"[VENDOR CHECK] No pending sessions found for vendor {vendor.name}", flush=True)
            # Check all sessions for this vendor for debugging
            all_sessions = self.db.query(ShipmentSession).filter(
                ShipmentSession.vendor_id == vendor.id
            ).all()
            print(f"[VENDOR CHECK] Vendor has {len(all_sessions)} total sessions", flush=True)
            return None
        
        print(f"[VENDOR CHECK] Found session #{session.id} to update", flush=True)
        
        # Create email record for vendor reply
        email = self.create_email(
            message_id=msg_data['id'],
            thread_id=msg_data['thread_id'],
            sender_email=sender_email,
            sender_name=msg_data['sender_name'],
            subject=subject,
            body=msg_data['body'],
            received_at=msg_data['internal_date']
        )
        
        email.category = EmailCategory.OTHER
        email.status = EmailStatus.COMPLETED
        
        # Update session with vendor reply info
        session.vendor_replied_at = datetime.now()
        session.vendor_reply_message_id = email.message_id
        session.vendor_reply_content = msg_data['body']
        session.updated_at = datetime.now()
        
        self.db.commit()
        
        print(f"[VENDOR REPLY] Vendor {vendor.name} replied to session #{session.id}", flush=True)
        
        return email
    
    def _extract_simple_fields(self, body: str) -> Dict[str, Any]:
        """
        Simple extraction of fields from reply body using pattern matching.
        Looks for patterns like "Field Name: Value"
        """
        import re
        
        extracted = {}
        
        # Common patterns for field extraction
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
                r'from\s+city\s*[:=]\s*(.+?)(?:\n|$)',
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
                r'to\s+address\s*[:=]\s*(.+?)(?:\n|$)',
            ],
            'recipient_city': [
                r'recipient\s+city\s*[:=]\s*(.+?)(?:\n|$)',
                r'delivery\s+city\s*[:=]\s*(.+?)(?:\n|$)',
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
                    # Get original case from body
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
        print(f"[MISSING INFO CHECK] Checking if email from {sender_email} is a missing info reply", flush=True)
        
        # Try to match by thread_id first
        session = self.db.query(ShipmentSession).filter(
            ShipmentSession.thread_id == msg_data.get('thread_id'),
            ShipmentSession.status == ShipmentStatus.INCOMPLETE,
            ShipmentSession.missing_fields != None
        ).order_by(ShipmentSession.created_at.desc()).first()
        
        # If not found, try to match by subject (for replies)
        if not session and msg_data.get('subject', '').lower().startswith('re:'):
            # Remove 'Re:' prefix and match to original subject
            original_subject = msg_data.get('subject', '').lower().replace('re:', '').strip()
            session = self.db.query(ShipmentSession).filter(
                ShipmentSession.subject.ilike(f'%{original_subject}%'),
                ShipmentSession.status == ShipmentStatus.INCOMPLETE,
                ShipmentSession.missing_fields != None
            ).order_by(ShipmentSession.created_at.desc()).first()
        
        if not session:
            print(f"[MISSING INFO CHECK] No matching incomplete session found for {sender_email}, will create new session after email.", flush=True)
            session = None
        else:
            print(f"[MISSING INFO CHECK] Found matching incomplete session #{session.id} with {len(session.missing_fields)} missing fields", flush=True)
        
        # Check for existing email record to avoid duplicate message_id
        existing_email = self.db.query(Email).filter(Email.message_id == msg_data['id']).first()
        if existing_email:
            print(f"[MISSING INFO CHECK] Email with message_id {msg_data['id']} already exists, skipping creation.", flush=True)
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
        
        # If session was not found, create it now with the correct email_id
        if session is None:
            new_session = ShipmentSession(
                email_id=email.id,
                sender_name=msg_data.get('sender_name'),
                sender_address=None,
                sender_city=None,
                recipient_name=None,
                recipient_address=None,
                recipient_city=None,
                package_description=None,
                status=ShipmentStatus.INCOMPLETE,
                missing_fields=[],
                thread_id=msg_data.get('thread_id'),
                subject=msg_data.get('subject')
            )
            self.db.add(new_session)
            self.db.commit()
            session = new_session
            print(f"[MISSING INFO CHECK] Created new session #{session.id} for sender {sender_email}", flush=True)
        
        # Prepare email data for agent with existing session data
        email_data = {
            "email_id": email.id,
            "message_id": email.message_id,
            "thread_id": email.thread_id,
            "sender_email": email.sender_email,
            "sender_name": email.sender_name,
            "subject": email.subject,
            "body": email.body,
            "received_at": email.received_at,
            # Mark this as a follow-up to force shipping request classification
            "is_follow_up": True,
            "missing_fields": session.missing_fields,
            # Pass existing session data to agent for context
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
                "pickup_date": session.pickup_date,
                "delivery_date": session.delivery_date,
            }
        }
        
        try:
            # First, try simple pattern-based extraction for common field formats
            simple_extracted = self._extract_simple_fields(msg_data['body'])
            print(f"[SIMPLE EXTRACT] Results: {simple_extracted}", flush=True)
            
            # Then use agent for more complex extraction
            result = email_agent.process_email(email_data)
            print(f"[MISSING INFO LOG] Agent result: {result}", flush=True)
            
            # Extract newly provided information
            agent_extracted = result.get('extracted_info', {})
            print(f"[MISSING INFO LOG] Agent extracted info: {agent_extracted}", flush=True)
            
            # Merge simple extraction with agent extraction (simple takes priority as it's more reliable for structured replies)
            newly_extracted = {**agent_extracted, **simple_extracted}
            print(f"[MISSING INFO LOG] Combined newly extracted info: {newly_extracted}", flush=True)
            
            # Merge existing session data with newly extracted info
            merged_data = {
                'sender_name': session.sender_name or newly_extracted.get('sender_name'),
                'sender_address': session.sender_address or newly_extracted.get('sender_address'),
                'sender_city': session.sender_city or newly_extracted.get('sender_city'),
                'sender_state': session.sender_state or newly_extracted.get('sender_state'),
                'sender_zipcode': session.sender_zipcode or newly_extracted.get('sender_zipcode'),
                'sender_country': session.sender_country or newly_extracted.get('sender_country'),
                'sender_phone': session.sender_phone or newly_extracted.get('sender_phone'),
                'recipient_name': session.recipient_name or newly_extracted.get('recipient_name'),
                'recipient_address': session.recipient_address or newly_extracted.get('recipient_address'),
                'recipient_city': session.recipient_city or newly_extracted.get('recipient_city'),
                'recipient_state': session.recipient_state or newly_extracted.get('recipient_state'),
                'recipient_zipcode': session.recipient_zipcode or newly_extracted.get('recipient_zipcode'),
                'recipient_country': session.recipient_country or newly_extracted.get('recipient_country'),
                'recipient_phone': session.recipient_phone or newly_extracted.get('recipient_phone'),
                'package_description': session.package_description or newly_extracted.get('package_description'),
                'package_weight': session.package_weight or newly_extracted.get('package_weight'),
                'package_dimensions': session.package_dimensions or newly_extracted.get('package_dimensions'),
                'package_value': session.package_value or newly_extracted.get('package_value'),
                'service_type': session.service_type or newly_extracted.get('service_type'),
                'pickup_date': session.pickup_date or newly_extracted.get('pickup_date'),
                'delivery_date': session.delivery_date or newly_extracted.get('delivery_date'),
            }
            
            # Update session with merged data
            session.sender_name = merged_data['sender_name']
            session.sender_address = merged_data['sender_address']
            session.sender_city = merged_data['sender_city']
            session.sender_state = merged_data['sender_state']
            session.sender_zipcode = merged_data['sender_zipcode']
            session.sender_country = merged_data['sender_country']
            session.sender_phone = merged_data['sender_phone']
            session.recipient_name = merged_data['recipient_name']
            session.recipient_address = merged_data['recipient_address']
            session.recipient_city = merged_data['recipient_city']
            session.recipient_state = merged_data['recipient_state']
            session.recipient_zipcode = merged_data['recipient_zipcode']
            session.recipient_country = merged_data['recipient_country']
            session.recipient_phone = merged_data['recipient_phone']
            session.package_description = merged_data['package_description']
            session.package_weight = merged_data['package_weight']
            session.package_dimensions = merged_data['package_dimensions']
            session.package_value = merged_data['package_value']
            session.service_type = merged_data['service_type']
            session.pickup_date = merged_data['pickup_date']
            session.delivery_date = merged_data['delivery_date']
            
            # Define required fields for a complete shipment
            required_fields = [
                'sender_name', 'sender_address', 'sender_city', 
                'recipient_name', 'recipient_address', 'recipient_city',
                'package_description'
            ]
            
            # Calculate what's actually still missing after merge
            actual_missing_fields = []
            for field in required_fields:
                if not merged_data.get(field):
                    actual_missing_fields.append(field)
            
            print(f"[MISSING INFO LOG] Actually missing fields after merge: {actual_missing_fields}", flush=True)
            
            # Update missing fields with actual missing fields
            session.missing_fields = actual_missing_fields
            
            # Update status if now complete
            if not actual_missing_fields:
                session.status = ShipmentStatus.COMPLETE
                session.completed_at = datetime.now()
                print(f"[MISSING INFO] Session #{session.id} is now complete!", flush=True)
            else:
                print(f"[MISSING INFO] Session #{session.id} updated, still missing: {actual_missing_fields}", flush=True)
            
            session.updated_at = datetime.now()
            session.missing_info_updated_at = datetime.now()
            print(f"[MISSING INFO LOG] Updated session fields and timestamps for session #{session.id}", flush=True)
            
            email.category = EmailCategory.SHIPPING_REQUEST
            email.is_shipping_request = True
            email.status = EmailStatus.COMPLETED
            email.processed_at = datetime.now()
            
            # Send confirmation or request for remaining missing info
            if session.status == ShipmentStatus.COMPLETE:
                response_message = (
                    "Thank you so much for providing the missing details! 😊 Your shipment request is now complete and we really appreciate your quick response. "
                    "We'll process your shipment and get back to you soon. If you have any other questions or need help, just let us know!"
                )
            elif actual_missing_fields:
                # Make field names more human-readable
                readable_fields = []
                for field in actual_missing_fields:
                    readable_field = field.replace('_', ' ').title()
                    readable_fields.append(readable_field)
                
                response_message = (
                    "Hey there! Thanks a ton for your update, we really appreciate it. Just a little more info and we'll be all set:\n\n"
                    f"• {chr(10).join('• ' + f for f in readable_fields)}\n\n"
                    "If you could reply with these details, that would be awesome! No rush—let us know if you have any questions or need help. 😊"
                )
            else:
                response_message = (
                    "Thank you for your update! Your shipment information has been received. We'll process it and get back to you soon!"
                )
            
            self.send_response_email(
                email=email,
                message=response_message,
                response_type="confirmation" if session.status == ShipmentStatus.COMPLETE else "missing_info",
                missing_fields=actual_missing_fields
            )
            
            self.db.commit()
            print(f"[MISSING INFO REPLY] Updated session #{session.id} from {sender_email} and committed to DB", flush=True)
            
            # Mark email as read
            self.email_service.mark_as_read(email.message_id)
            
            return email
            
        except Exception as e:
            print(f"[MISSING INFO ERROR] Failed to process: {str(e)}", flush=True)
            import traceback
            traceback.print_exc()
            self.db.rollback()
            return None
    
    def get_shipment_by_id(self, shipment_id: int) -> Optional[ShipmentSession]:
        """Get shipment session by ID"""
        return self.db.query(ShipmentSession).filter(ShipmentSession.id == shipment_id).first()