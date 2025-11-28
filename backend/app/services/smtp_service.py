import imaplib
import smtplib
import email
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import parsedate_to_datetime, make_msgid
from typing import List, Dict, Optional, Set
from datetime import datetime
import re

from app.config import settings


class SMTPService:
    """Service for interacting with email via SMTP/IMAP"""
    
    def __init__(self):
        self.imap_server = settings.imap_server
        self.imap_port = settings.imap_port
        self.smtp_server = settings.smtp_server
        self.smtp_port = settings.smtp_port
        self.email_address = settings.email_address
        self.email_password = settings.email_password
        self.use_ssl = settings.email_use_ssl
        self.imap_connection = None
        self.smtp_connection = None
    
    def connect_imap(self) -> bool:
        """Connect to IMAP server to read emails"""
        try:
            if self.use_ssl:
                self.imap_connection = imaplib.IMAP4_SSL(self.imap_server, self.imap_port)
            else:
                self.imap_connection = imaplib.IMAP4(self.imap_server, self.imap_port)
            
            self.imap_connection.login(self.email_address, self.email_password)
            return True
            
        except Exception as e:
            print(f"IMAP connection error: {str(e)}")
            return False
    
    def connect_smtp(self) -> bool:
        """Connect to SMTP server to send emails"""
        try:
            if self.smtp_port == 465:
                self.smtp_connection = smtplib.SMTP_SSL(self.smtp_server, self.smtp_port)
            else:
                self.smtp_connection = smtplib.SMTP(self.smtp_server, self.smtp_port)
                self.smtp_connection.starttls()
            
            self.smtp_connection.login(self.email_address, self.email_password)
            return True
            
        except Exception as e:
            print(f"SMTP connection error: {str(e)}")
            return False
    
    def disconnect_imap(self):
        """Disconnect from IMAP server"""
        if self.imap_connection:
            try:
                self.imap_connection.close()
                self.imap_connection.logout()
            except:
                pass
            self.imap_connection = None
    
    def disconnect_smtp(self):
        """Disconnect from SMTP server"""
        if self.smtp_connection:
            try:
                self.smtp_connection.quit()
            except:
                pass
            self.smtp_connection = None
    
    def get_unread_messages(self, max_results: int = 10, folder: str = "INBOX") -> List[Dict]:
        """
        Get unread messages from email account via IMAP
        
        Args:
            max_results: Maximum number of messages to retrieve
            folder: Email folder to check (default: INBOX)
            
        Returns:
            List of message dictionaries
        """
        if not self.imap_connection:
            if not self.connect_imap():
                return []
        
        try:
            self.imap_connection.select(folder)
            status, messages = self.imap_connection.search(None, 'UNSEEN')
            
            if status != 'OK':
                return []
            
            message_ids = messages[0].split()
            message_ids = message_ids[-max_results:] if len(message_ids) > max_results else message_ids
            
            result = []
            
            for msg_id in message_ids:
                status, msg_data = self.imap_connection.fetch(msg_id, '(RFC822)')
                
                if status != 'OK':
                    continue
                
                email_message = email.message_from_bytes(msg_data[0][1])
                message_dict = self._parse_email_message(email_message, msg_id.decode())
                result.append(message_dict)
            
            return result
            
        except Exception as e:
            print(f"Error fetching unread messages: {str(e)}")
            return []
        finally:
            self.disconnect_imap()
    
    def _extract_forwarded_message_ids(self, body: str) -> Set[str]:
        """
        Extract message IDs from forwarded email content.
        Looks for Message-ID patterns in the email body.
        """
        message_ids = set()
        
        # Pattern to match email Message-IDs in forwarded content
        # Message-IDs typically look like: <some-unique-id@domain.com>
        patterns = [
            r'<[a-zA-Z0-9\-_.]+@[a-zA-Z0-9\-_.]+>',  # Standard format
            r'Message-ID:\s*(<[^>]+>)',  # Explicit Message-ID header
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, body, re.IGNORECASE)
            for match in matches:
                # Clean up the match
                msg_id = match.strip('<>') if not match.startswith('<') else match
                if '@' in msg_id and len(msg_id) > 10:  # Basic validation
                    message_ids.add(msg_id if msg_id.startswith('<') else f'<{msg_id}>')
        
        return message_ids
    
    def _is_shipping_related(self, subject: str, body: str) -> bool:
        """
        Determine if email content is shipping/logistics related
        by analyzing keywords and patterns.
        """
        # Combine subject and body for analysis
        content = f"{subject} {body}".lower()
        
        # Shipping-related keywords
        shipping_keywords = [
            'shipment', 'shipping', 'freight', 'cargo', 'delivery',
            'pickup', 'transport', 'logistics', 'container', 'package',
            'sender', 'recipient', 'tracking', 'courier', 'dispatch',
            'quotation', 'rate', 'customs clearance', 'door to door',
            'reefer', 'temperature controlled', 'cntr', 'fcl', 'lcl',
            'air freight', 'sea freight', 'warehouse', 'forwarding',
            'bill of lading', 'awb', 'consignment', 'pallet'
        ]
        
        # Check if content contains shipping keywords
        matches = sum(1 for keyword in shipping_keywords if keyword in content)
        
        # If 2 or more shipping keywords found, consider it shipping-related
        if matches >= 2:
            print(f"[SHIPPING DETECTION] Found {matches} shipping keywords in content", flush=True)
            return True
        
        return False
    
    def _extract_thread_id(self, email_message, body: str) -> str:
        """
        Extract thread ID from email headers and body content.
        For forwarded emails, also extracts original message IDs from body.
        """
        message_id = email_message.get('Message-ID', '').strip()
        in_reply_to = email_message.get('In-Reply-To', '').strip()
        references = email_message.get('References', '').strip()
        subject = email_message.get('Subject', '').lower()
        
        # Check if this is a forwarded email
        is_forwarded = subject.startswith('fwd:') or subject.startswith('fw:')
        
        print(f"[THREAD DETECTION] Is Forwarded: {is_forwarded}", flush=True)
        
        # For forwarded emails, try to extract original message IDs from body
        if is_forwarded:
            forwarded_ids = self._extract_forwarded_message_ids(body)
            if forwarded_ids:
                # Use the first extracted ID as the thread root
                thread_id = list(forwarded_ids)[0]
                print(f"[THREAD DETECTION] Extracted forwarded thread_id from body: {thread_id}", flush=True)
                print(f"[THREAD DETECTION] All forwarded IDs found: {forwarded_ids}", flush=True)
                return thread_id
        
        # Standard threading logic
        if references:
            ref_list = references.strip().split()
            if ref_list:
                thread_id = ref_list[0].strip()
                print(f"[THREAD DETECTION] Using first Reference as thread_id: {thread_id}", flush=True)
                return thread_id
        
        if in_reply_to:
            thread_id = in_reply_to.strip()
            print(f"[THREAD DETECTION] Using In-Reply-To as thread_id: {thread_id}", flush=True)
            return thread_id
        
        # New thread
        thread_id = message_id
        print(f"[THREAD DETECTION] New thread, using Message-ID as thread_id: {thread_id}", flush=True)
        return thread_id
    
    def _parse_email_message(self, email_message, message_id: str) -> Dict:
        """Parse email message to standard format with enhanced thread detection"""
        
        # Get sender info
        sender = email_message.get('From', '')
        sender_name = ''
        sender_email = sender
        
        match = re.match(r'(.+?)\s*<(.+?)>', sender)
        if match:
            sender_name = match.group(1).strip('"')
            sender_email = match.group(2)
        
        # Get date
        date_str = email_message.get('Date', '')
        try:
            received_at = parsedate_to_datetime(date_str)
        except:
            received_at = datetime.now()
        
        # Get subject
        subject = email_message.get('Subject', '')
        
        # Get body
        body = self._get_email_body(email_message)
        
        # Extract thread ID with body content analysis for forwarded emails
        thread_id = self._extract_thread_id(email_message, body)
        
        # Extract all related message IDs for tracking
        related_message_ids = self._extract_forwarded_message_ids(body)
        
        # Determine if this is shipping-related based on content
        is_shipping_related = self._is_shipping_related(subject, body)
        
        print(f"[EMAIL PARSE] Subject: {subject}", flush=True)
        print(f"[EMAIL PARSE] Message-ID: {email_message.get('Message-ID', '')}", flush=True)
        print(f"[EMAIL PARSE] Thread-ID: {thread_id}", flush=True)
        print(f"[EMAIL PARSE] In-Reply-To: {email_message.get('In-Reply-To', '')}", flush=True)
        print(f"[EMAIL PARSE] References: {email_message.get('References', '')}", flush=True)
        print(f"[EMAIL PARSE] Related Message IDs: {related_message_ids}", flush=True)
        print(f"[EMAIL PARSE] Is Shipping Related: {is_shipping_related}", flush=True)
        
        return {
            'id': message_id,
            'thread_id': thread_id,
            'sender_email': sender_email,
            'sender_name': sender_name,
            'subject': subject,
            'body': body,
            'internal_date': received_at,
            'raw': None,
            'related_message_ids': list(related_message_ids),  # All message IDs found in content
            'is_shipping_related': is_shipping_related,  # Content-based shipping detection
            'is_forwarded': subject.lower().startswith(('fwd:', 'fw:')),
            'is_reply': subject.lower().startswith('re:')
        }
    
    def _get_email_body(self, email_message) -> str:
        """Extract email body from message"""
        body = ''
        
        if email_message.is_multipart():
            for part in email_message.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get('Content-Disposition', ''))
                
                if 'attachment' in content_disposition:
                    continue
                
                if content_type == 'text/plain':
                    body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                    break
                elif content_type == 'text/html' and not body:
                    body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            body = email_message.get_payload(decode=True).decode('utf-8', errors='ignore')
        
        return body
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        html: bool = False,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> bool:
        """Send an email via SMTP"""
        if not self.smtp_connection:
            if not self.connect_smtp():
                return False
        
        try:
            message = MIMEMultipart('alternative')
            message['From'] = self.email_address
            message['To'] = to_email
            message['Subject'] = subject
            
            if cc:
                message['Cc'] = ', '.join(cc)
            if bcc:
                message['Bcc'] = ', '.join(bcc)
            
            if html:
                part = MIMEText(body, 'html')
            else:
                part = MIMEText(body, 'plain')
            
            message.attach(part)
            
            recipients = [to_email]
            if cc:
                recipients.extend(cc)
            if bcc:
                recipients.extend(bcc)
            
            self.smtp_connection.sendmail(self.email_address, recipients, message.as_string())
            
            return True
            
        except Exception as e:
            print(f"Error sending email: {str(e)}")
            return False
        finally:
            self.disconnect_smtp()
    
    def send_reply(
        self,
        to_email: str,
        subject: str,
        body: str,
        html: bool = False,
        in_reply_to: Optional[str] = None,
        references: Optional[str] = None
    ) -> Optional[str]:
        """Send a reply email"""
        if not self.smtp_connection:
            if not self.connect_smtp():
                return None
        
        try:
            if not subject.startswith('Re: '):
                subject = f'Re: {subject}'
            
            message = MIMEMultipart('alternative')
            message['From'] = self.email_address
            message['To'] = to_email
            message['Subject'] = subject
            
            message_id = make_msgid(domain=self.email_address.split('@')[1])
            message['Message-ID'] = message_id
            
            if in_reply_to:
                message['In-Reply-To'] = in_reply_to
            if references:
                message['References'] = references
            elif in_reply_to:
                message['References'] = in_reply_to
            
            if html:
                part = MIMEText(body, 'html')
            else:
                part = MIMEText(body, 'plain')
            
            message.attach(part)
            
            self.smtp_connection.sendmail(self.email_address, [to_email], message.as_string())
            
            return message_id
            
        except Exception as e:
            print(f"Error sending reply: {str(e)}")
            return None
        finally:
            self.disconnect_smtp()
    
    def mark_as_read(self, message_id: str, folder: str = "INBOX") -> bool:
        """Mark a message as read"""
        if not self.imap_connection:
            if not self.connect_imap():
                return False
        
        try:
            self.imap_connection.select(folder)
            self.imap_connection.store(message_id.encode(), '+FLAGS', '\\Seen')
            return True
            
        except Exception as e:
            print(f"Error marking message as read: {str(e)}")
            return False
        finally:
            self.disconnect_imap()
    
    def authenticate(self) -> bool:
        """Authenticate with email server"""
        return self.connect_imap() and self.connect_smtp()


# Create singleton instance
smtp_service = SMTPService()