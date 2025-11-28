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
                - is_shipping_related: Boolean hint from heuristics
                - thread_context: List of previous emails in thread
                
        Returns:
            Final state after processing
        """
        
        # Initialize state with data from the Service
        initial_state: EmailAgentState = {
            "email_id": email_data.get("email_id"),
            "message_id": email_data["message_id"],
            "thread_id": email_data.get("thread_id"),
            "sender_email": email_data["sender_email"],
            "sender_name": email_data.get("sender_name"),
            "subject": email_data["subject"],
            "body": email_data["body"],
            "received_at": email_data["received_at"],
            
            # Pass the heuristic hint. 
            # Note: The 'classify' node will usually overwrite this based on LLM analysis,
            # but the Service layer handles the final override if LLM fails but Regex succeeds.
            "is_shipping_request": email_data.get("is_shipping_related", False),
            
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
            "agent_logs": [],
            
            # Ensure thread context is passed if available
            "thread_context": email_data.get("thread_context", [])
        }
        
        # Run the graph
        # This executes the nodes defined in _build_graph in order
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
   - Extract sender information (Original Sender from forwarded threads)
   - Extract recipient information
   - Extract package details
   - Map Airport Codes (IST, RUH) to Cities
   ↓

3. VALIDATE
   - Check for essential fields (Origin, Destination, Package)
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


# Create singleton instance to be imported by EmailService
email_agent = EmailProcessingAgent()