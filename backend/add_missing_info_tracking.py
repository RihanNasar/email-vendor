"""
Add missing_info_updated_at field to shipment_sessions table
Run this once to update the database schema
"""
from sqlalchemy import text
from app.models.database import engine

def add_missing_info_tracking_field():
    """Add missing_info_updated_at column to shipment_sessions table"""
    
    with engine.connect() as conn:
        try:
            # Add missing_info_updated_at column
            conn.execute(text("""
                ALTER TABLE shipment_sessions 
                ADD COLUMN IF NOT EXISTS missing_info_updated_at TIMESTAMP
            """))
            
            conn.commit()
            print("✓ Successfully added missing_info_updated_at field")
            
        except Exception as e:
            print(f"✗ Error adding missing_info_updated_at field: {e}")
            conn.rollback()

if __name__ == "__main__":
    add_missing_info_tracking_field()
