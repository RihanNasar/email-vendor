"""
Add is_forwarded and is_reply fields to emails table
Run this once to update the database schema
"""
from sqlalchemy import text
from app.models.database import engine

def add_is_forwarded_is_reply_fields():
    """Add is_forwarded and is_reply columns to emails table"""
    with engine.connect() as conn:
        try:
            # Add is_forwarded column
            conn.execute(text("""
                ALTER TABLE emails 
                ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT FALSE
            """))
            # Add is_reply column
            conn.execute(text("""
                ALTER TABLE emails 
                ADD COLUMN IF NOT EXISTS is_reply BOOLEAN DEFAULT FALSE
            """))
            conn.commit()
            print("✓ Successfully added is_forwarded and is_reply fields")
        except Exception as e:
            print(f"✗ Error adding fields: {e}")
            conn.rollback()

if __name__ == "__main__":
    add_is_forwarded_is_reply_fields()
