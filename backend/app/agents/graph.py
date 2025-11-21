from langgraph.graph import StateGraph, END
from typing import Dict, Any

from app.agents.state import EmailAgentState
from app.agents.nodes import (
    EmailClassificationNode,
    InformationExtractionNode,
    ValidationNode,
    ResponseGenerationNode
)


class EmailProcessingAgent:
    """
    LangGraph-based agent for processing emails and managing shipment requests
    
    Workflow:
    1. Classify email (shipping request or not)
    2. Extract shipment information
    3. Validate completeness
    4. Generate appropriate response
    """
    
    def __init__(self):
        # Initialize nodes
        self.classify_node = EmailClassificationNode()
        self.extract_node = InformationExtractionNode()
        self.validate_node = ValidationNode()
        self.response_node = ResponseGenerationNode()
        
        # Build graph
        self.graph = self._build_graph()
    
    def _build_graph(self) -> StateGraph:
        """Build the LangGraph workflow"""
        
        # Create state graph
        workflow = StateGraph(EmailAgentState)
        
        # Add nodes
        workflow.add_node("classify", self.classify_node)
        workflow.add_node("extract_info", self.extract_node)
        workflow.add_node("validate", self.validate_node)
        workflow.add_node("generate_response", self.response_node)
        
        # Define edges
        workflow.set_entry_point("classify")
        
        # After classification, go to extraction
        workflow.add_edge("classify", "extract_info")
        
        # After extraction, go to validation
        workflow.add_edge("extract_info", "validate")
        
        # After validation, generate response
        workflow.add_edge("validate", "generate_response")
        
        # After response generation, end
        workflow.add_edge("generate_response", END)
        
        return workflow.compile()
    
    def process_email(self, email_data: Dict[str, Any]) -> EmailAgentState:
        """
        Process an email through the agent workflow
        
        Args:
            email_data: Dictionary containing email information
                - message_id: Email message ID
                - thread_id: Email conversation/thread ID
                - sender_email: Sender email address
                - sender_name: Sender name
                - subject: Email subject
                - body: Email body
                - received_at: When email was received
                
        Returns:
            Final state after processing
        """
        
        # Initialize state
        initial_state: EmailAgentState = {
            "email_id": email_data.get("email_id"),
            "message_id": email_data["message_id"],
            "thread_id": email_data.get("thread_id"),
            "sender_email": email_data["sender_email"],
            "sender_name": email_data.get("sender_name"),
            "subject": email_data["subject"],
            "body": email_data["body"],
            "received_at": email_data["received_at"],
            "is_shipping_request": False,
            "category": "other",
            "classification_confidence": 0.0,
            "classification_reasoning": "",
            "extracted_info": {},
            "is_complete": False,
            "missing_fields": [],
            "should_respond": False,
            "response_message": None,
            "response_sent": False,
            "current_step": "classify",
            "errors": [],
            "agent_logs": []
        }
        
        # Run the graph
        result = self.graph.invoke(initial_state)
        
        return result
    
    def get_workflow_visualization(self) -> str:
        """Get a text representation of the workflow"""
        return """
Email Processing Workflow:
==========================

1. CLASSIFY
   - Determine if email is a shipping/logistics request
   - Categorize email type
   - Calculate confidence score
   ↓

2. EXTRACT_INFO
   - Extract sender information
   - Extract recipient information
   - Extract package details
   - Extract service requirements
   ↓

3. VALIDATE
   - Check for required fields
   - Identify missing information
   - Determine if shipment is ready
   ↓

4. GENERATE_RESPONSE
   - If complete: Send confirmation
   - If incomplete: Request missing info
   ↓

5. END
   - Update database
   - Send email response
"""


# Create singleton instance
email_agent = EmailProcessingAgent()
