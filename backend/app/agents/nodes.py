from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.output_parsers import PydanticOutputParser
from typing import Dict, Any
import json

from app.config import settings
from app.agents.state import EmailAgentState
from app.models.schemas import EmailClassification, ExtractedShipmentInfo, EmailCategoryEnum


class EmailClassificationNode:
    """Node for classifying emails as shipping requests, queries, or spam"""
    
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
Your job is to analyze incoming emails and categorize them into exactly ONE of the following categories:

1. **shipping_request**: 
   - A direct request to ship goods, get a freight rate, or a quote.
   - Look for keywords like "Rate Request", "Quote", "Booking", "Shipment from X to Y".
   - Includes "Forwarded" emails where the *original* message is a rate request.

2. **query**:
   - General questions, tracking updates, or information requests.
   - E.g., "Where is my package?", "Do you ship to Mars?", "What are your office hours?", "Status update please".
   - This is NOT a request to start a NEW shipment.

3. **spam**:
   - Marketing emails, newsletters, solicitations to sell services TO us (e.g. SEO, Web Design), or obvious junk.

4. **other**: 
   - Personal emails, HR matters, or anything that fits none of the above.

Provide your classification with a confidence score (0-1) and a brief reasoning.

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
        # Using gpt-4o is recommended for complex forwarded threads
        self.llm = ChatOpenAI(
            model="gpt-4o", 
            temperature=0,
            api_key=settings.openai_api_key
        )
        self.parser = PydanticOutputParser(pydantic_object=ExtractedShipmentInfo)
    
    def __call__(self, state: EmailAgentState) -> Dict[str, Any]:
        """Extract shipment information from the email"""
        
        # Only run extraction if it is a shipping request
        if not state.get('is_shipping_request'):
            return {
                "extracted_info": {},
                "current_step": "end",
                "should_respond": False
            }
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert at extracting shipping information from complex email threads.

**CRITICAL INSTRUCTIONS FOR FORWARDED EMAILS:**
1. This email likely contains multiple "Forwarded message" headers. 
2. **IGNORE** the header information of the forwarder (the person sending *this* email).
3. Look for the **ORIGINAL REQUESTER** signature at the bottom of the deepest message in the thread.
4. Extract the 'Sender Name' from that original signature.

**LOCATION INTELLIGENCE:**
- If you see Airport/Port Codes (e.g., IST, RUH, JED, LHR, DXB), map them to their Cities (e.g., IST -> Istanbul, RUH -> Riyadh).
- "Dry Port" -> Extract as the City/Location.

**DATA EXTRACTION:**
Extract ALL available information into the correct fields defined in the schema.
- Combine Commodity, Temperature, and Container Type into 'package_description'.

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
            
            # Convert to dict and filter out None values or empty strings
            extracted_dict = {
                k: v for k, v in extracted.dict().items() 
                if v is not None and v != "" and v != "N/A"
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
    
    # We require specific fields to consider a request "complete" enough to process
    REQUIRED_FIELDS = [
        "package_description"
    ]
    
    def __call__(self, state: EmailAgentState) -> Dict[str, Any]:
        """Validate extracted information for completeness"""
        
        extracted_info = state.get('extracted_info', {})
        
        # Logic: We need at least a City OR an Address for Origin and Destination
        has_origin = extracted_info.get('sender_city') or extracted_info.get('sender_address')
        has_dest = extracted_info.get('recipient_city') or extracted_info.get('recipient_address')
        has_package = extracted_info.get('package_description')

        missing_fields = []
        if not has_origin:
            missing_fields.append("sender_city")
        if not has_dest:
            missing_fields.append("recipient_city")
        if not has_package:
            missing_fields.append("package_description")

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
    """Node for generating email responses for Shipping Requests"""
    
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
1. Thank them for providing complete information.
2. Briefly summarize the key details (Origin, Destination, Package) to show you understood.
3. Mention that their shipment request is being processed.
4. Offer to assist with any questions."""),
            ("human", """Generate a confirmation email for this shipment request:

Origin: {sender_city}
Destination: {recipient_city}
Package: {package_description}

Extracted information:
{extracted_info}""")
        ])
        
        extracted_info = state.get('extracted_info', {})
        
        formatted_prompt = prompt.format_messages(
            sender_city=extracted_info.get('sender_city', 'Unknown Origin'),
            recipient_city=extracted_info.get('recipient_city', 'Unknown Destination'),
            package_description=extracted_info.get('package_description', 'Package'),
            extracted_info=json.dumps(extracted_info, indent=2)
        )
        
        response = self.llm.invoke(formatted_prompt)
        return response.content
    
    def _generate_missing_info_message(self, state: EmailAgentState) -> str:
        """Generate message requesting missing information"""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a friendly and casual logistics customer service agent.
Generate a professional but conversational email requesting missing information for a shipping request.

Tone guidelines:
- Be warm and approachable.
- If we successfully extracted some info (like Origin or Destination), mention it briefly.
- List the MISSING info clearly (bullet points).
- Ask them to reply with these details.

"""),
            ("human", """Generate a request for missing information:

What we successfully extracted:
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