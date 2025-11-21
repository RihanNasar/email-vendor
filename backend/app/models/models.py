from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Enum as SQLEnum, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.models.database import Base


class EmailStatus(str, enum.Enum):
    """Email processing status"""
    UNPROCESSED = "unprocessed"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class EmailCategory(str, enum.Enum):
    """Email category classification"""
    SHIPPING_REQUEST = "shipping_request"
    LOGISTICS_INQUIRY = "logistics_inquiry"
    OTHER = "other"


class ShipmentStatus(str, enum.Enum):
    """Shipment session status"""
    INCOMPLETE = "incomplete"
    PENDING_INFO = "pending_info"
    COMPLETE = "complete"
    CREATED = "created"


class Email(Base):
    """Model for storing processed emails"""
    __tablename__ = "emails"
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(String(255), unique=True, index=True, nullable=False)
    thread_id = Column(String(255), index=True)
    
    # Email content
    sender_email = Column(String(255), nullable=False, index=True)
    sender_name = Column(String(255))
    subject = Column(Text)
    body = Column(Text)
    
    # Classification
    category = Column(SQLEnum(EmailCategory), default=EmailCategory.OTHER)
    is_shipping_request = Column(Boolean, default=False)
    
    # Processing
    status = Column(SQLEnum(EmailStatus), default=EmailStatus.UNPROCESSED)
    processed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Metadata
    received_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    shipment_session = relationship("ShipmentSession", back_populates="email", uselist=False)
    responses = relationship("EmailResponse", back_populates="email")


class ShipmentSession(Base):
    """Model for tracking shipment request sessions"""
    __tablename__ = "shipment_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"), unique=True, nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    
    # Shipment details
    sender_name = Column(String(255))
    sender_address = Column(Text)
    sender_city = Column(String(100))
    sender_state = Column(String(100))
    sender_zipcode = Column(String(20))
    sender_country = Column(String(100))
    sender_phone = Column(String(50))
    
    recipient_name = Column(String(255))
    recipient_address = Column(Text)
    recipient_city = Column(String(100))
    recipient_state = Column(String(100))
    recipient_zipcode = Column(String(20))
    recipient_country = Column(String(100))
    recipient_phone = Column(String(50))
    
    # Package details
    package_weight = Column(String(50))
    package_dimensions = Column(String(100))
    package_description = Column(Text)
    package_value = Column(String(50))
    
    # Service details
    service_type = Column(String(100))  # e.g., express, standard, overnight
    pickup_date = Column(DateTime)
    delivery_date = Column(DateTime)
    
    # Status and tracking
    status = Column(SQLEnum(ShipmentStatus), default=ShipmentStatus.INCOMPLETE)
    missing_fields = Column(JSON, default=list)  # List of missing required fields
    extracted_data = Column(JSON, default=dict)  # All extracted data

    # Email thread and subject for matching replies
    thread_id = Column(String(255), nullable=True, index=True)
    subject = Column(Text, nullable=True)
    
    # Vendor tracking
    vendor_notified_at = Column(DateTime, nullable=True)
    vendor_replied_at = Column(DateTime, nullable=True)
    vendor_reply_message_id = Column(String(255), nullable=True)
    vendor_reply_content = Column(Text, nullable=True)
    
    # Missing info tracking
    missing_info_updated_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    email = relationship("Email", back_populates="shipment_session")
    vendor = relationship("Vendor", backref="shipment_sessions")


class EmailResponse(Base):
    """Model for tracking automated email responses"""
    __tablename__ = "email_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"), nullable=False)
    
    # Response details
    response_message_id = Column(String(255), unique=True)
    subject = Column(Text)
    body = Column(Text)
    
    # Response type
    response_type = Column(String(50))  # e.g., missing_info, confirmation, error
    missing_fields_requested = Column(JSON, default=list)
    
    # Status
    sent_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    email = relationship("Email", back_populates="responses")


class AgentLog(Base):
    """Model for logging agent actions and decisions"""
    __tablename__ = "agent_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"), nullable=True)
    
    # Log details
    agent_step = Column(String(100))  # e.g., classify, extract, validate
    input_data = Column(JSON)
    output_data = Column(JSON)
    decision = Column(Text)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    execution_time = Column(Integer)  # milliseconds


class Vendor(Base):
    """Model for storing vendor information"""
    __tablename__ = "vendors"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Vendor details
    name = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone = Column(String(50))
    company = Column(String(255), index=True)
    address = Column(Text)
    
    # Vendor type
    vendor_type = Column(String(50), index=True)  # shipping, logistics, freight, courier, warehouse
    
    # Additional info
    rating = Column(Integer)  # Rating out of 5
    description = Column(Text)
    active = Column(Boolean, default=True, index=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

