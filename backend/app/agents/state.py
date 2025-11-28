from typing import TypedDict, List, Dict, Any, Optional
from datetime import datetime


class EmailAgentState(TypedDict):
    """State object for the email processing agent"""
    # Email information
    email_id: Optional[int]
    message_id: str
    thread_id: Optional[str]
    sender_email: str
    sender_name: Optional[str]
    subject: str
    body: str
    received_at: datetime
    
    # Context & Metadata (ADDED THESE)
    thread_context: List[Dict[str, Any]]  # Holds previous emails in the thread
    is_forwarded: bool                    # Helps agent know to look for original sender
    is_reply: bool                        # Helps context understanding
    
    # Classification results
    is_shipping_request: bool
    category: str
    classification_confidence: float
    classification_reasoning: str
    
    # Extracted shipment information
    extracted_info: Dict[str, Any]
    
    # Validation results
    is_complete: bool
    missing_fields: List[str]
    
    # Response information
    should_respond: bool
    response_message: Optional[str]
    response_sent: bool
    
    # Processing metadata
    current_step: str
    errors: List[str]
    agent_logs: List[Dict[str, Any]]