"""
Update database schema manually for PostgreSQL.
Adds missing columns safely by isolating transactions for each column.
Run this file once: python update_db.py
"""
from sqlalchemy import text
from app.models.database import engine

def add_column_safely(table_name, column_name, column_type):
    """
    Attempts to add a column in its own isolated transaction. 
    If it fails (e.g., column exists), it rolls back just that step and continues.
    """
    # Open a new connection for each attempt to ensure clean transaction state
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            print(f"   > Attempting to add '{column_name}' to '{table_name}'...")
            
            # PostgreSQL syntax using IF NOT EXISTS to prevent errors if possible
            # Note: IF NOT EXISTS for columns requires Postgres 9.6+
            sql = text(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {column_type}")
            
            conn.execute(sql)
            transaction.commit()
            print(f"     ✓ Success: {table_name}.{column_name}")
            
        except Exception as e:
            transaction.rollback()
            # Check if the error is harmless (column already exists)
            error_str = str(e).lower()
            if "already exists" in error_str or "duplicate column" in error_str:
                print(f"     - Skipped: '{column_name}' already exists.")
            else:
                print(f"     ! Error adding '{column_name}': {e}")

def update_schema():
    print("🔄 Starting database schema update (PostgreSQL Safe Mode)...")
    print("==========================================================")
    
    # --- 1. UPDATE EMAILS TABLE ---
    print("\n[1/2] Updating 'emails' table...")
    # Using BOOLEAN DEFAULT FALSE for Postgres consistency
    add_column_safely("emails", "is_forwarded", "BOOLEAN DEFAULT FALSE")
    add_column_safely("emails", "is_reply", "BOOLEAN DEFAULT FALSE")

    # --- 2. UPDATE SHIPMENT_SESSIONS TABLE ---
    print("\n[2/2] Updating 'shipment_sessions' table...")
    
    # List of columns to add
    # Note: Using TIMESTAMP instead of DATETIME for PostgreSQL
    columns = [
        ("thread_id", "VARCHAR(500)"),
        ("subject", "VARCHAR(500)"),
        ("vendor_notified_at", "TIMESTAMP"),
        ("vendor_replied_at", "TIMESTAMP"),
        ("vendor_reply_message_id", "VARCHAR(255)"),
        ("vendor_reply_content", "TEXT"),
        ("missing_info_updated_at", "TIMESTAMP")
    ]

    for col_name, col_type in columns:
        add_column_safely("shipment_sessions", col_name, col_type)

    print("\n==========================================================")
    print("✅ Database update process finished.")

if __name__ == "__main__":
    update_schema()