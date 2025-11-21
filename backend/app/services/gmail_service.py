import os
import pickle
import base64
from typing import List, Dict, Optional
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings


class GmailService:
    """Service for interacting with Gmail API"""
    
    def __init__(self):
        self.credentials = None
        self.service = None
        self.token_file = "token.pickle"
        self.credentials_file = "credentials.json"
    
    def authenticate(self) -> bool:
        """
        Authenticate with Gmail API using OAuth2
        Returns True if authentication is successful
        """
        try:
            # Load existing credentials
            if os.path.exists(self.token_file):
                with open(self.token_file, 'rb') as token:
                    self.credentials = pickle.load(token)
            
            # Refresh or get new credentials
            if not self.credentials or not self.credentials.valid:
                if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                    self.credentials.refresh(Request())
                else:
                    # Create credentials.json from environment variables
                    # Works with Web application OAuth client
                    credentials_info = {
                        "web": {
                            "client_id": settings.gmail_client_id,
                            "client_secret": settings.gmail_client_secret,
                            "redirect_uris": [settings.gmail_redirect_uri],
                            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                            "token_uri": "https://oauth2.googleapis.com/token",
                            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
                        }
                    }
                    
                    flow = InstalledAppFlow.from_client_config(
                        credentials_info,
                        settings.gmail_scopes_list
                    )
                    # Web app: use port 8080 for OAuth callback
                    self.credentials = flow.run_local_server(
                        port=8080,
                        open_browser=True,
                        success_message='Authentication successful! You can close this window.'
                    )
                
                # Save credentials
                with open(self.token_file, 'wb') as token:
                    pickle.dump(self.credentials, token)
            
            # Build service
            self.service = build('gmail', 'v1', credentials=self.credentials)
            return True
            
        except Exception as e:
            print(f"Authentication error: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_unread_messages(self, max_results: int = 10, query: str = "is:unread") -> List[Dict]:
        """
        Get unread messages from Gmail
        
        Args:
            max_results: Maximum number of messages to retrieve
            query: Gmail search query
            
        Returns:
            List of message dictionaries with id, threadId, and other details
        """
        if not self.service:
            if not self.authenticate():
                return []
        
        try:
            results = self.service.users().messages().list(
                userId='me',
                q=query,
                maxResults=max_results
            ).execute()
            
            messages = results.get('messages', [])
            
            detailed_messages = []
            for message in messages:
                msg = self.get_message_details(message['id'])
                if msg:
                    detailed_messages.append(msg)
            
            return detailed_messages
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return []
    
    def get_message_details(self, message_id: str) -> Optional[Dict]:
        """
        Get detailed information about a specific message
        
        Args:
            message_id: Gmail message ID
            
        Returns:
            Dictionary with message details
        """
        if not self.service:
            if not self.authenticate():
                return None
        
        try:
            message = self.service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute()
            
            # Extract headers
            headers = message['payload']['headers']
            subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '')
            sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
            date = next((h['value'] for h in headers if h['name'].lower() == 'date'), '')
            
            # Extract body
            body = self._extract_body(message['payload'])
            
            # Parse sender email and name
            sender_email = sender
            sender_name = sender
            if '<' in sender and '>' in sender:
                sender_name = sender.split('<')[0].strip().strip('"')
                sender_email = sender.split('<')[1].split('>')[0].strip()
            
            return {
                'id': message['id'],
                'thread_id': message['threadId'],
                'subject': subject,
                'sender': sender,
                'sender_email': sender_email,
                'sender_name': sender_name,
                'date': date,
                'body': body,
                'snippet': message.get('snippet', ''),
                'internal_date': datetime.fromtimestamp(int(message['internalDate']) / 1000)
            }
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return None
    
    def _extract_body(self, payload: Dict) -> str:
        """Extract email body from message payload"""
        if 'parts' in payload:
            parts = payload['parts']
            for part in parts:
                if part['mimeType'] == 'text/plain':
                    if 'data' in part['body']:
                        return base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                elif 'parts' in part:
                    return self._extract_body(part)
        
        if 'body' in payload and 'data' in payload['body']:
            return base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8')
        
        return ""
    
    def send_reply(
        self,
        to: str,
        subject: str,
        body: str,
        thread_id: Optional[str] = None,
        in_reply_to: Optional[str] = None
    ) -> Optional[str]:
        """
        Send a reply email
        
        Args:
            to: Recipient email address
            subject: Email subject
            body: Email body
            thread_id: Thread ID to reply to
            in_reply_to: Message ID to reply to
            
        Returns:
            Sent message ID or None if failed
        """
        if not self.service:
            if not self.authenticate():
                return None
        
        try:
            message = MIMEMultipart()
            message['to'] = to
            message['subject'] = subject
            
            if in_reply_to:
                message['In-Reply-To'] = in_reply_to
                message['References'] = in_reply_to
            
            msg_body = MIMEText(body, 'plain')
            message.attach(msg_body)
            
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            
            send_message = {'raw': raw}
            if thread_id:
                send_message['threadId'] = thread_id
            
            result = self.service.users().messages().send(
                userId='me',
                body=send_message
            ).execute()
            
            return result['id']
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return None
    
    def mark_as_read(self, message_id: str) -> bool:
        """
        Mark a message as read
        
        Args:
            message_id: Gmail message ID
            
        Returns:
            True if successful
        """
        if not self.service:
            if not self.authenticate():
                return False
        
        try:
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            return True
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return False
    
    def add_label(self, message_id: str, label_name: str) -> bool:
        """
        Add a label to a message
        
        Args:
            message_id: Gmail message ID
            label_name: Label name
            
        Returns:
            True if successful
        """
        if not self.service:
            if not self.authenticate():
                return False
        
        try:
            # Get or create label
            label_id = self._get_or_create_label(label_name)
            if not label_id:
                return False
            
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'addLabelIds': [label_id]}
            ).execute()
            return True
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return False
    
    def _get_or_create_label(self, label_name: str) -> Optional[str]:
        """Get label ID or create if it doesn't exist"""
        try:
            # List all labels
            results = self.service.users().labels().list(userId='me').execute()
            labels = results.get('labels', [])
            
            # Check if label exists
            for label in labels:
                if label['name'] == label_name:
                    return label['id']
            
            # Create new label
            label_object = {
                'name': label_name,
                'labelListVisibility': 'labelShow',
                'messageListVisibility': 'show'
            }
            created_label = self.service.users().labels().create(
                userId='me',
                body=label_object
            ).execute()
            
            return created_label['id']
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return None
