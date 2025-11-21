"""
Add vendor reply tracking fields to shipment_sessions table
Run this once to update the database schema
"""
from sqlalchemy import text
from app.models.database import engine

def add_vendor_tracking_fields():
    """Add vendor tracking columns to shipment_sessions table"""
    
    with engine.connect() as conn:
        try:
            # Add vendor_notified_at column
            conn.execute(text("""
                ALTER TABLE shipment_sessions 
                ADD COLUMN IF NOT EXISTS vendor_notified_at TIMESTAMP
            """))
            
            # Add vendor_replied_at column
            conn.execute(text("""
                ALTER TABLE shipment_sessions 
                ADD COLUMN IF NOT EXISTS vendor_replied_at TIMESTAMP
            """))
            
            # Add vendor_reply_message_id column
            conn.execute(text("""
                ALTER TABLE shipment_sessions 
                ADD COLUMN IF NOT EXISTS vendor_reply_message_id VARCHAR(255)
            """))
            
            # Add vendor_reply_content column
            conn.execute(text("""
                ALTER TABLE shipment_sessions 
                ADD COLUMN IF NOT EXISTS vendor_reply_content TEXT
            """))
            
            conn.commit()
            print("✓ Successfully added vendor tracking fields")
            
        except Exception as e:
            print(f"✗ Error adding vendor tracking fields: {e}")
            conn.rollback()

if __name__ == "__main__":
    add_vendor_tracking_fields()
