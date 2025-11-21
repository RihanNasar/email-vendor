from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.output_parsers import PydanticOutputParser
from typing import Dict, Any
import json

from app.config import settings
from app.agents.state import EmailAgentState
from app.models.schemas import EmailClassification, ExtractedShipmentInfo


class EmailClassificationNode:
    """Node for classifying emails as shipping/logistics requests"""
    
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            api_key=settings.openai_api_key
        )
        self.parser = PydanticOutputParser(pydantic_object=EmailClassification)
    
    def __call__(self, state: EmailAgentState) -> Dict[str, Any]:
        """Classify the email"""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert email classifier for a logistics company.
Your task is to analyze emails and determine if they are shipping or logistics requests.

A shipping/logistics request typically contains:
- Request to ship a package or freight
- Mention of pickup and delivery locations
- Package details (weight, dimensions, description)
- Sender and recipient information
- Logistics inquiries about rates, services, or tracking

Classify the email into one of these categories:
- shipping_request: Direct request to ship something
- logistics_inquiry: Questions about shipping services, rates, or tracking
- other: Not related to shipping or logistics

Provide your classification with confidence score (0-1) and reasoning.

{format_instructions}"""),
            ("human", """Subject: {subject}

From: {sender_email} ({sender_name})

Body:
{body}

Classify this email.""")
        ])
        
        formatted_prompt = prompt.format_messages(
            format_instructions=self.parser.get_format_instructions(),
            subject=state['subject'],
            sender_email=state['sender_email'],
            sender_name=state.get('sender_name', 'Unknown'),
            body=state['body']
        )
        
        try:
            response = self.llm.invoke(formatted_prompt)
            classification = self.parser.parse(response.content)
            
            return {
                "is_shipping_request": classification.is_shipping_request,
                "category": classification.category.value,
                "classification_confidence": classification.confidence,
                "classification_reasoning": classification.reasoning,
                "current_step": "extract_info",
                "agent_logs": state.get("agent_logs", []) + [{
                    "step": "classify",
                    "timestamp": str(state['received_at']),
                    "result": {
                        "category": classification.category.value,
                        "is_shipping_request": classification.is_shipping_request,
                        "confidence": classification.confidence
                    }
                }]
            }
        except Exception as e:
            return {
                "is_shipping_request": False,
                "category": "other",
                "classification_confidence": 0.0,
                "classification_reasoning": f"Error during classification: {str(e)}",
                "current_step": "end",
                "errors": state.get("errors", []) + [f"Classification error: {str(e)}"]
            }


class InformationExtractionNode:
    """Node for extracting shipment information from email"""
    
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            api_key=settings.openai_api_key
        )
        self.parser = PydanticOutputParser(pydantic_object=ExtractedShipmentInfo)
    
    def __call__(self, state: EmailAgentState) -> Dict[str, Any]:
        """Extract shipment information from the email"""
        
        if not state.get('is_shipping_request'):
            return {
                "extracted_info": {},
                "current_step": "end",
                "should_respond": False
            }
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert at extracting shipping information from emails.

Extract ALL available information from the email. Look for:

SENDER INFORMATION:
- Name, address, city, state, zipcode, country, phone

RECIPIENT INFORMATION:
- Name, address, city, state, zipcode, country, phone

PACKAGE INFORMATION:
- Weight (with units like lbs, kg)
- Dimensions (length x width x height with units)
- Description of contents
- Declared value

SERVICE INFORMATION:
- Service type (express, standard, overnight, freight, etc.)
- Preferred pickup date
- Required delivery date

Extract only information that is explicitly mentioned or clearly implied.
Use null for fields that are not found in the email.

{format_instructions}"""),
            ("human", """Subject: {subject}

From: {sender_email} ({sender_name})

Body:
{body}

Extract all shipping information from this email.""")
        ])
        
        formatted_prompt = prompt.format_messages(
            format_instructions=self.parser.get_format_instructions(),
            subject=state['subject'],
            sender_email=state['sender_email'],
            sender_name=state.get('sender_name', 'Unknown'),
            body=state['body']
        )
        
        try:
            response = self.llm.invoke(formatted_prompt)
            extracted = self.parser.parse(response.content)
            
            # Convert to dict and filter out None values
            extracted_dict = {
                k: v for k, v in extracted.dict().items() 
                if v is not None
            }
            
            return {
                "extracted_info": extracted_dict,
                "current_step": "validate",
                "agent_logs": state.get("agent_logs", []) + [{
                    "step": "extract",
                    "timestamp": str(state['received_at']),
                    "result": {
                        "fields_found": len(extracted_dict),
                        "fields": list(extracted_dict.keys())
                    }
                }]
            }
        except Exception as e:
            return {
                "extracted_info": {},
                "current_step": "validate",
                "errors": state.get("errors", []) + [f"Extraction error: {str(e)}"]
            }


class ValidationNode:
    """Node for validating completeness of extracted information"""
    
    # Only require the most essential fields for shipment (no city fields)
    REQUIRED_FIELDS = [
        "sender_name", "sender_address",
        "recipient_name", "recipient_address",
        "package_description"
    ]
    
    def __call__(self, state: EmailAgentState) -> Dict[str, Any]:
        """Validate extracted information for completeness"""
        
        extracted_info = state.get('extracted_info', {})
        
        # Always ask for all missing fields at once
        missing_fields = [
            field for field in self.REQUIRED_FIELDS
            if field not in extracted_info or not extracted_info[field]
        ]

        is_complete = len(missing_fields) == 0

        return {
            "is_complete": is_complete,
            "missing_fields": missing_fields,
            "current_step": "generate_response",
            "should_respond": True,
            "agent_logs": state.get("agent_logs", []) + [{
                "step": "validate",
                "timestamp": str(state['received_at']),
                "result": {
                    "is_complete": is_complete,
                    "missing_count": len(missing_fields),
                    "missing_fields": missing_fields
                }
            }]
        }


class ResponseGenerationNode:
    """Node for generating email responses"""
    
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.7,
            api_key=settings.openai_api_key
        )
    
    def __call__(self, state: EmailAgentState) -> Dict[str, Any]:
        """Generate appropriate email response"""
        
        if not state.get('should_respond'):
            return {
                "response_message": None,
                "current_step": "end"
            }
        
        if state.get('is_complete'):
            # Generate confirmation message
            message = self._generate_confirmation_message(state)
        else:
            # Generate missing info request
            message = self._generate_missing_info_message(state)
        
        return {
            "response_message": message,
            "current_step": "end",
            "agent_logs": state.get("agent_logs", []) + [{
                "step": "generate_response",
                "timestamp": str(state['received_at']),
                "result": {
                    "response_type": "confirmation" if state.get('is_complete') else "missing_info",
                    "message_length": len(message)
                }
            }]
        }
    
    def _generate_confirmation_message(self, state: EmailAgentState) -> str:
        """Generate confirmation message for complete information"""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a helpful logistics customer service agent.
Generate a professional and friendly email confirming that you received all necessary 
shipping information and that a shipment session has been created.

Include:
1. Thank them for providing complete information
2. Briefly summarize the key details (sender, recipient, package)
3. Mention that their shipment request is being processed
4. Provide a reference number (use the email subject or create one)
5. Offer to assist with any questions"""),
            ("human", """Generate a confirmation email for this shipment request:

Sender: {sender_name}
Recipient: {recipient_name}
Package: {package_description}

Extracted information:
{extracted_info}""")
        ])
        
        extracted_info = state.get('extracted_info', {})
        
        formatted_prompt = prompt.format_messages(
            sender_name=extracted_info.get('sender_name', 'Unknown'),
            recipient_name=extracted_info.get('recipient_name', 'Unknown'),
            package_description=extracted_info.get('package_description', 'Package'),
            extracted_info=json.dumps(extracted_info, indent=2)
        )
        
        response = self.llm.invoke(formatted_prompt)
        return response.content
    
    def _generate_missing_info_message(self, state: EmailAgentState) -> str:
        """Generate message requesting missing information"""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a friendly and casual logistics customer service agent.
Generate a casual, conversational email requesting missing information for a shipping request.

Tone guidelines:
- Be warm and approachable, like talking to a friend
- Use casual language (e.g., "Hey", "Thanks for reaching out", "Just need a few more details")
- Keep it brief and to the point
- Don't use overly formal phrases like "Dear Sir/Madam" or "We hereby inform you"
- Use contractions (we'll, you're, it's) to sound more natural
- End with something friendly like "Looking forward to hearing from you!" or "Thanks!"

Include:
1. Quick thank you for their interest
2. Mention you just need a bit more info to get started
3. List the missing info in a simple, friendly way (use bullet points or a numbered list)
4. If you have some info, briefly mention it so they know you're not starting from scratch
5. Ask them to shoot back a reply when they can"""),
            ("human", """Generate a casual request for missing information:

What we have:
{extracted_info}

Missing information needed:
{missing_fields}""")
        ])
        
        extracted_info = state.get('extracted_info', {})
        missing_fields = state.get('missing_fields', [])
        
        # Format missing fields nicely
        formatted_missing = "\n".join([f"- {field.replace('_', ' ').title()}" for field in missing_fields])
        
        formatted_prompt = prompt.format_messages(
            extracted_info=json.dumps(extracted_info, indent=2) if extracted_info else "None",
            missing_fields=formatted_missing
        )
        
        response = self.llm.invoke(formatted_prompt)
        return response.content
