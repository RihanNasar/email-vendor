import os
import json
import pickle
import webbrowser
from typing import List, Dict, Optional
from datetime import datetime
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading

import msal
from app.config import settings


class OutlookService:
    """Service for interacting with Microsoft Graph API (Outlook)"""
    
    def __init__(self):
        self.access_token = None
        self.token_file = "outlook_token.pickle"
        self.client_id = settings.outlook_client_id
        self.client_secret = settings.outlook_client_secret
        self.tenant_id = settings.outlook_tenant_id
        self.redirect_uri = settings.outlook_redirect_uri
        self.scopes = settings.outlook_scopes_list
        self.authority = f"https://login.microsoftonline.com/{self.tenant_id}"
        self.graph_endpoint = "https://graph.microsoft.com/v1.0"
        
        # Create MSAL app
        self.app = msal.ConfidentialClientApplication(
            self.client_id,
            authority=self.authority,
            client_credential=self.client_secret,
        )
    
    def authenticate(self) -> bool:
        """
        Authenticate with Microsoft Graph API using OAuth2
        Returns True if authentication is successful
        """
        try:
            # Load existing token
            if os.path.exists(self.token_file):
                with open(self.token_file, 'rb') as token:
                    token_data = pickle.load(token)
                    self.access_token = token_data.get('access_token')
                    
                    # Check if token is still valid by making a test request
                    if self._test_token():
                        return True
            
            # Get new token via OAuth flow
            print("Opening browser for authentication...")
            
            # Get authorization URL
            auth_url = self.app.get_authorization_request_url(
                scopes=self.scopes,
                redirect_uri=self.redirect_uri
            )
            
            # Open browser
            webbrowser.open(auth_url)
            
            # Start local server to capture redirect
            auth_code = self._get_auth_code()
            
            if not auth_code:
                print("Failed to get authorization code")
                return False
            
            # Exchange code for token
            result = self.app.acquire_token_by_authorization_code(
                auth_code,
                scopes=self.scopes,
                redirect_uri=self.redirect_uri
            )
            
            if "access_token" in result:
                self.access_token = result["access_token"]
                
                # Save token
                with open(self.token_file, 'wb') as token:
                    pickle.dump(result, token)
                
                print("Authentication successful!")
                return True
            else:
                print(f"Authentication failed: {result.get('error_description', 'Unknown error')}")
                return False
            
        except Exception as e:
            print(f"Authentication error: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def _test_token(self) -> bool:
        """Test if current token is valid"""
        if not self.access_token:
            return False
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                f"{self.graph_endpoint}/me",
                headers=headers
            )
            return response.status_code == 200
        except:
            return False
    
    def _get_auth_code(self) -> Optional[str]:
        """Start local server to capture OAuth redirect"""
        auth_code = [None]
        
        class AuthHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                # Parse the authorization code from URL
                query_components = parse_qs(urlparse(self.path).query)
                
                if 'code' in query_components:
                    auth_code[0] = query_components['code'][0]
                    
                    # Send success response
                    self.send_response(200)
                    self.send_header('Content-type', 'text/html')
                    self.end_headers()
                    self.wfile.write(b'<html><body><h1>Authentication successful!</h1><p>You can close this window.</p></body></html>')
                else:
                    self.send_response(400)
                    self.send_header('Content-type', 'text/html')
                    self.end_headers()
                    self.wfile.write(b'<html><body><h1>Authentication failed!</h1></body></html>')
            
            def log_message(self, format, *args):
                pass  # Suppress log messages
        
        # Parse port from redirect URI
        parsed_uri = urlparse(self.redirect_uri)
        port = parsed_uri.port or 8000
        
        server = HTTPServer(('localhost', port), AuthHandler)
        
        # Run server in separate thread with timeout
        def run_server():
            server.timeout = 120  # 2 minutes timeout
            server.handle_request()
        
        thread = threading.Thread(target=run_server)
        thread.daemon = True
        thread.start()
        thread.join(timeout=120)
        
        return auth_code[0]
    
    def get_unread_messages(self, max_results: int = 10) -> List[Dict]:
        """
        Get unread messages from Outlook
        
        Args:
            max_results: Maximum number of messages to retrieve
            
        Returns:
            List of message dictionaries
        """
        if not self.access_token:
            if not self.authenticate():
                return []
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            # Query for unread messages
            response = requests.get(
                f"{self.graph_endpoint}/me/messages",
                headers=headers,
                params={
                    '$filter': 'isRead eq false',
                    '$top': max_results,
                    '$orderby': 'receivedDateTime desc',
                    '$select': 'id,subject,from,receivedDateTime,bodyPreview,body,conversationId,internetMessageId'
                }
            )
            
            if response.status_code == 200:
                messages = response.json().get('value', [])
                
                # Format messages
                formatted_messages = []
                for msg in messages:
                    formatted_messages.append(self._format_message(msg))
                
                return formatted_messages
            else:
                print(f"Error fetching messages: {response.status_code} - {response.text}")
                return []
            
        except Exception as e:
            print(f"Error getting messages: {str(e)}")
            return []
    
    def get_message_details(self, message_id: str) -> Optional[Dict]:
        """
        Get detailed information about a specific message
        
        Args:
            message_id: Outlook message ID
            
        Returns:
            Dictionary with message details
        """
        if not self.access_token:
            if not self.authenticate():
                return None
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                f"{self.graph_endpoint}/me/messages/{message_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                msg = response.json()
                return self._format_message(msg)
            else:
                print(f"Error fetching message: {response.status_code} - {response.text}")
                return None
            
        except Exception as e:
            print(f"Error getting message: {str(e)}")
            return None
    
    def _format_message(self, msg: Dict) -> Dict:
        """Format Outlook message to standard format"""
        from_field = msg.get('from', {}).get('emailAddress', {})
        
        return {
            'id': msg.get('id'),
            'thread_id': msg.get('conversationId'),
            'subject': msg.get('subject', ''),
            'sender': f"{from_field.get('name', '')} <{from_field.get('address', '')}>",
            'sender_email': from_field.get('address', ''),
            'sender_name': from_field.get('name', ''),
            'date': msg.get('receivedDateTime'),
            'body': msg.get('body', {}).get('content', ''),
            'snippet': msg.get('bodyPreview', ''),
            'internal_date': datetime.fromisoformat(msg.get('receivedDateTime', '').replace('Z', '+00:00')) if msg.get('receivedDateTime') else None,
            'internet_message_id': msg.get('internetMessageId')
        }
    
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
            thread_id: Thread ID to reply to (conversationId)
            in_reply_to: Message ID to reply to
            
        Returns:
            Sent message ID or None if failed
        """
        if not self.access_token:
            if not self.authenticate():
                return None
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            if in_reply_to:
                # Reply to existing message
                message_data = {
                    "comment": body
                }
                
                response = requests.post(
                    f"{self.graph_endpoint}/me/messages/{in_reply_to}/reply",
                    headers=headers,
                    json=message_data
                )
            else:
                # Send new message
                message_data = {
                    "message": {
                        "subject": subject,
                        "body": {
                            "contentType": "Text",
                            "content": body
                        },
                        "toRecipients": [
                            {
                                "emailAddress": {
                                    "address": to
                                }
                            }
                        ]
                    }
                }
                
                response = requests.post(
                    f"{self.graph_endpoint}/me/sendMail",
                    headers=headers,
                    json=message_data
                )
            
            if response.status_code in [200, 201, 202]:
                print("Email sent successfully!")
                return "sent"  # Outlook doesn't return message ID for sent messages
            else:
                print(f"Error sending email: {response.status_code} - {response.text}")
                return None
            
        except Exception as e:
            print(f"Error sending email: {str(e)}")
            return None
    
    def mark_as_read(self, message_id: str) -> bool:
        """
        Mark a message as read
        
        Args:
            message_id: Outlook message ID
            
        Returns:
            True if successful
        """
        if not self.access_token:
            if not self.authenticate():
                return False
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.patch(
                f"{self.graph_endpoint}/me/messages/{message_id}",
                headers=headers,
                json={"isRead": True}
            )
            
            return response.status_code == 200
            
        except Exception as e:
            print(f"Error marking as read: {str(e)}")
            return False
    
    def add_category(self, message_id: str, category_name: str) -> bool:
        """
        Add a category to a message (similar to Gmail labels)
        
        Args:
            message_id: Outlook message ID
            category_name: Category name
            
        Returns:
            True if successful
        """
        if not self.access_token:
            if not self.authenticate():
                return False
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            # Get current categories
            response = requests.get(
                f"{self.graph_endpoint}/me/messages/{message_id}",
                headers=headers,
                params={'$select': 'categories'}
            )
            
            if response.status_code != 200:
                return False
            
            current_categories = response.json().get('categories', [])
            
            if category_name not in current_categories:
                current_categories.append(category_name)
            
            # Update categories
            response = requests.patch(
                f"{self.graph_endpoint}/me/messages/{message_id}",
                headers=headers,
                json={"categories": current_categories}
            )
            
            return response.status_code == 200
            
        except Exception as e:
            print(f"Error adding category: {str(e)}")
            return False


# Create singleton instance
outlook_service = OutlookService()
