"""
Add thread_id and subject columns to shipment_sessions table
Run this once to update the database schema
"""
from sqlalchemy import text
from app.models.database import engine

def add_thread_subject_fields():
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE shipment_sessions 
                ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255)
            """))
            conn.execute(text("""
                ALTER TABLE shipment_sessions 
                ADD COLUMN IF NOT EXISTS subject TEXT
            """))
            conn.commit()
            print("✓ Successfully added thread_id and subject columns to shipment_sessions table")
        except Exception as e:
            print(f"✗ Error adding columns: {e}")
            conn.rollback()

if __name__ == "__main__":
    add_thread_subject_fields()
