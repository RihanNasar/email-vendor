import imaplib
import smtplib
import email
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import parsedate_to_datetime, make_msgid
from typing import List, Dict, Optional
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
        """
        Connect to IMAP server to read emails
        Returns True if connection is successful
        """
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
        """
        Connect to SMTP server to send emails
        Returns True if connection is successful
        """
        try:
            # For Gmail SMTP on port 587, use STARTTLS
            # For port 465, use SMTP_SSL
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
            # Select inbox
            self.imap_connection.select(folder)
            
            # Search for unread messages
            status, messages = self.imap_connection.search(None, 'UNSEEN')
            
            if status != 'OK':
                return []
            
            message_ids = messages[0].split()
            
            # Limit results
            message_ids = message_ids[-max_results:] if len(message_ids) > max_results else message_ids
            
            result = []
            
            for msg_id in message_ids:
                status, msg_data = self.imap_connection.fetch(msg_id, '(RFC822)')
                
                if status != 'OK':
                    continue
                
                # Parse email
                email_message = email.message_from_bytes(msg_data[0][1])
                
                # Extract message details
                message_dict = self._parse_email_message(email_message, msg_id.decode())
                result.append(message_dict)
            
            return result
            
        except Exception as e:
            print(f"Error fetching unread messages: {str(e)}")
            return []
        finally:
            self.disconnect_imap()
    
    def _parse_email_message(self, email_message, message_id: str) -> Dict:
        """Parse email message to standard format"""
        
        # Get sender info
        sender = email_message.get('From', '')
        sender_name = ''
        sender_email = sender
        
        # Extract name and email from "Name <email@example.com>" format
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
        
        # Get thread ID (use Message-ID header)
        thread_id = email_message.get('Message-ID', message_id)
        
        return {
            'id': message_id,
            'thread_id': thread_id,
            'sender_email': sender_email,
            'sender_name': sender_name,
            'subject': subject,
            'body': body,
            'internal_date': received_at,
            'raw': None  # SMTP/IMAP doesn't provide raw format like Gmail API
        }
    
    def _get_email_body(self, email_message) -> str:
        """Extract email body from message"""
        body = ''
        
        if email_message.is_multipart():
            # Get the first text/plain or text/html part
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
        """
        Send an email via SMTP
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Email body
            html: Whether body is HTML (default: False)
            cc: CC recipients
            bcc: BCC recipients
            
        Returns:
            True if email sent successfully
        """
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
            
            # Attach body
            if html:
                part = MIMEText(body, 'html')
            else:
                part = MIMEText(body, 'plain')
            
            message.attach(part)
            
            # Send email
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
        """
        Send a reply email
        
        Args:
            to_email: Recipient email address
            subject: Email subject (will be prefixed with "Re: " if not already)
            body: Email body
            html: Whether body is HTML
            in_reply_to: Message-ID this is replying to
            references: References header for threading
            
        Returns:
            Message ID if successful, None otherwise
        """
        if not self.smtp_connection:
            if not self.connect_smtp():
                return None
        
        try:
            # Ensure subject has "Re: " prefix
            if not subject.startswith('Re: '):
                subject = f'Re: {subject}'
            
            message = MIMEMultipart('alternative')
            message['From'] = self.email_address
            message['To'] = to_email
            message['Subject'] = subject
            
            # Generate unique Message-ID
            message_id = make_msgid(domain=self.email_address.split('@')[1])
            message['Message-ID'] = message_id
            
            # Add threading headers
            if in_reply_to:
                message['In-Reply-To'] = in_reply_to
            if references:
                message['References'] = references
            elif in_reply_to:
                message['References'] = in_reply_to
            
            # Attach body
            if html:
                part = MIMEText(body, 'html')
            else:
                part = MIMEText(body, 'plain')
            
            message.attach(part)
            
            # Send email
            self.smtp_connection.sendmail(self.email_address, [to_email], message.as_string())
            
            # Return the Message-ID
            return message_id
            
        except Exception as e:
            print(f"Error sending reply: {str(e)}")
            return None
        finally:
            self.disconnect_smtp()
    
    def mark_as_read(self, message_id: str, folder: str = "INBOX") -> bool:
        """
        Mark a message as read
        
        Args:
            message_id: Message ID to mark as read
            folder: Email folder (default: INBOX)
            
        Returns:
            True if successful
        """
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
        """
        Authenticate with email server
        Returns True if authentication is successful
        """
        return self.connect_imap() and self.connect_smtp()


# Create singleton instance
smtp_service = SMTPService()
