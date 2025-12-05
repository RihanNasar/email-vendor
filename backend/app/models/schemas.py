from pydantic import BaseModel, EmailStr, Field, field_serializer
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ==========================================
# 1. ENUMS
# ==========================================

class EmailCategoryEnum(str, Enum):
    SHIPPING_REQUEST = "shipping_request"
    LOGISTICS_INQUIRY = "logistics_inquiry"
    QUERY = "query"
    SPAM = "spam"
    OTHER = "other"


class ShipmentStatusEnum(str, Enum):
    INCOMPLETE = "incomplete"
    PENDING_INFO = "pending_info"
    COMPLETE = "complete"
    CREATED = "created"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ASSIGNED = "assigned"
    CANCELLED = "cancelled"


class EmailStatusEnum(str, Enum):
    NEW = "new"
    PROCESSING = "processing"
    RESPONDED = "responded"
    COMPLETED = "completed"
    UNPROCESSED = "unprocessed"
    FAILED = "failed"
    IGNORED = "IGNORED"


class VendorTypeEnum(str, Enum):
    SHIPPING = "shipping"
    LOGISTICS = "logistics"
    FREIGHT = "freight"
    COURIER = "courier"
    WAREHOUSE = "warehouse"


# ==========================================
# 2. AI / LLM SPECIFIC MODELS
# ==========================================

class EmailClassification(BaseModel):
    """Schema for email classification results"""
    category: EmailCategoryEnum = Field(description="The classification category: shipping_request, query, or spam")
    is_shipping_request: bool = Field(description="True ONLY if it is a request for a shipping rate, quote, or booking")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    reasoning: str = Field(description="Brief explanation of why this classification was chosen")


class ExtractedShipmentInfo(BaseModel):
    """Schema for extracted shipment information - Used by AI Agent"""
    
    # Sender / Origin
    sender_name: Optional[str] = Field(None, description="Name of the original requester/sender")
    sender_address: Optional[str] = Field(None, description="Full origin address if available")
    sender_city: Optional[str] = Field(None, description="Origin City (Map airport codes like IST to Istanbul)")
    sender_state: Optional[str] = Field(None, description="Origin State/Province")
    sender_zipcode: Optional[str] = Field(None, description="Origin Zip/Postal Code")
    sender_country: Optional[str] = Field(None, description="Origin Country")
    sender_phone: Optional[str] = Field(None, description="Sender phone number")
    
    # Recipient / Destination
    recipient_name: Optional[str] = Field(None, description="Name of the recipient")
    recipient_address: Optional[str] = Field(None, description="Full destination address if available")
    recipient_city: Optional[str] = Field(None, description="Destination City (Map airport codes like RUH to Riyadh)")
    recipient_state: Optional[str] = Field(None, description="Destination State/Province")
    recipient_zipcode: Optional[str] = Field(None, description="Destination Zip/Postal Code")
    recipient_country: Optional[str] = Field(None, description="Destination Country")
    recipient_phone: Optional[str] = Field(None, description="Recipient phone number")
    
    # Package Details
    package_weight: Optional[str] = Field(None, description="Weight with units (e.g. 500kg)")
    package_dimensions: Optional[str] = Field(None, description="Dimensions with units (e.g. 10x10x10 cm)")
    package_description: Optional[str] = Field(None, description="Combined description: Commodity + Container Type + Temperature")
    package_value: Optional[str] = Field(None, description="Declared value of goods")
    
    # Service Details
    service_type: Optional[str] = Field(None, description="Requested service (Door to Door, Port to Port, Air, Sea)")
    pickup_date: Optional[str] = Field(None, description="Requested pickup date")
    delivery_date: Optional[str] = Field(None, description="Requested delivery date")


class MissingInfoResponse(BaseModel):
    """Schema for missing information response"""
    missing_fields: List[str]
    message: str
    extracted_info: Dict[str, Any]


# ==========================================
# 3. API / DB MODELS
# ==========================================

class EmailBase(BaseModel):
    message_id: str
    sender_email: EmailStr
    subject: Optional[str] = None
    body: Optional[str] = None


class EmailCreate(EmailBase):
    thread_id: Optional[str] = None
    sender_name: Optional[str] = None
    received_at: datetime


# --- Schema for nested replies (Used inside EmailResponse) ---
class EmailReplySchema(BaseModel):
    id: int
    body: str
    sent_at: datetime
    
    @field_serializer('id', when_used='json')
    def serialize_id(self, value: int) -> str:
        return str(value)
        
    @field_serializer('sent_at', when_used='json')
    def serialize_datetime(self, value: datetime) -> str:
        return value.isoformat()

    class Config:
        from_attributes = True


class EmailResponse(EmailBase):
    id: int
    category: EmailCategoryEnum
    is_shipping_request: bool
    status: str
    created_at: datetime
    received_at: datetime
    sender_name: Optional[str] = None
    thread_id: Optional[str] = None
    confidence: float = 0.0
    missing_information: Optional[List[str]] = None
    extracted_data: Optional[Dict[str, Any]] = None
    session_id: Optional[int] = None
    
    # --- The critical field for chat history ---
    responses: List[EmailReplySchema] = []
    
    @field_serializer('id', 'session_id', when_used='json')
    def serialize_ids(self, value: Optional[int]) -> Optional[str]:
        return str(value) if value is not None else None
    
    @field_serializer('created_at', 'received_at', when_used='json')
    def serialize_datetime(self, value: datetime) -> str:
        return value.isoformat()
    
    class Config:
        from_attributes = True
        populate_by_name = True
        fields = {
            'sender_email': {'alias': 'senderEmail'},
            'sender_name': {'alias': 'sender'},
            'is_shipping_request': {'alias': 'isShippingRequest'},
            'message_id': {'alias': 'outlookMessageId'},
            'created_at': {'alias': 'createdAt'},
            'received_at': {'alias': 'receivedAt'},
            'missing_information': {'alias': 'missingInformation'},
            'extracted_data': {'alias': 'extractedData'},
            'session_id': {'alias': 'sessionId'}
        }


class ShipmentSessionBase(BaseModel):
    sender_name: Optional[str] = None
    sender_address: Optional[str] = None
    sender_city: Optional[str] = None
    sender_state: Optional[str] = None
    sender_zipcode: Optional[str] = None
    sender_country: Optional[str] = None
    sender_phone: Optional[str] = None
    
    recipient_name: Optional[str] = None
    recipient_address: Optional[str] = None
    recipient_city: Optional[str] = None
    recipient_state: Optional[str] = None
    recipient_zipcode: Optional[str] = None
    recipient_country: Optional[str] = None
    recipient_phone: Optional[str] = None
    
    package_weight: Optional[str] = None
    package_dimensions: Optional[str] = None
    package_description: Optional[str] = None
    package_value: Optional[str] = None
    
    service_type: Optional[str] = None
    pickup_date: Optional[datetime] = None
    delivery_date: Optional[datetime] = None


class ShipmentSessionCreate(ShipmentSessionBase):
    email_id: int


class ShipmentSessionResponse(ShipmentSessionBase):
    id: int
    email_id: int
    vendor_id: Optional[int] = None
    vendor_notified_at: Optional[datetime] = None
    vendor_replied_at: Optional[datetime] = None
    vendor_reply_message_id: Optional[str] = None
    vendor_reply_content: Optional[str] = None
    missing_info_updated_at: Optional[datetime] = None
    status: ShipmentStatusEnum
    missing_fields: List[str]
    extracted_data: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    
    # Additional fields for frontend compatibility
    sender_email: Optional[str] = None
    recipient_email: Optional[str] = None
    package_weight_numeric: Optional[float] = None
    package_dimensions_dict: Optional[str] = None
    shipping_method: Optional[str] = None
    estimated_cost: Optional[float] = None
    notes: Optional[str] = None
    assigned_vendor: Optional[Dict[str, Any]] = None
    
    @field_serializer('id', 'email_id', 'vendor_id', when_used='json')
    def serialize_ids(self, value: Optional[int]) -> Optional[str]:
        return str(value) if value is not None else None
    
    @field_serializer('created_at', 'updated_at', 'pickup_date', 'delivery_date', 'vendor_notified_at', 'vendor_replied_at', 'missing_info_updated_at', when_used='json')
    def serialize_datetime(self, value: Optional[datetime]) -> Optional[str]:
        return value.isoformat() if value else None
    
    class Config:
        from_attributes = True
        populate_by_name = True
        fields = {
            'id': {'alias': 'sessionId'},
            'email_id': {'alias': 'emailId'},
            'vendor_id': {'alias': 'assignedVendorId'},
            'sender_name': {'alias': 'senderName'},
            'sender_email': {'alias': 'senderEmail'},
            'sender_phone': {'alias': 'senderPhone'},
            'sender_address': {'alias': 'senderAddress'},
            'recipient_name': {'alias': 'recipientName'},
            'recipient_email': {'alias': 'recipientEmail'},
            'recipient_phone': {'alias': 'recipientPhone'},
            'recipient_address': {'alias': 'recipientAddress'},
            'package_description': {'alias': 'packageDescription'},
            'package_weight_numeric': {'alias': 'packageWeight'},
            'package_dimensions_dict': {'alias': 'packageDimensions'},
            'shipping_method': {'alias': 'shippingMethod'},
            'estimated_cost': {'alias': 'estimatedCost'},
            'assigned_vendor': {'alias': 'assignedVendor'},
            'created_at': {'alias': 'createdAt'},
            'updated_at': {'alias': 'updatedAt'}
        }


# ==========================================
# 4. VENDOR SCHEMAS
# ==========================================

class VendorBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    vendor_type: VendorTypeEnum
    description: Optional[str] = None
    address: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    active: bool = True


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    vendor_type: Optional[VendorTypeEnum] = None
    description: Optional[str] = None
    address: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    active: Optional[bool] = None


class VendorResponse(VendorBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    @field_serializer('id', when_used='json')
    def serialize_id(self, value: int) -> str:
        return str(value)
    
    @field_serializer('created_at', 'updated_at', when_used='json')
    def serialize_datetime(self, value: datetime) -> str:
        return value.isoformat()
    
    class Config:
        from_attributes = True