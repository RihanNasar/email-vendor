from sqlalchemy.orm import Session
from datetime import datetime

from app.models.models import Email, EmailStatus, EmailCategory

class QueryService:
    """Service for handling general queries (non-shipment requests)"""
    
    def __init__(self, db: Session):
        self.db = db
        # No SMTP or LLM service needed here anymore as response is manual

    def process_query(self, email: Email) -> bool:
        """
        Process a general query email.
        
        Action: 
        1. Classify as LOGISTICS_INQUIRY.
        2. Set status to UNPROCESSED (or kept as is) to indicate it needs manual attention.
        3. Do NOT send an automated reply.
        """
        print(f"[QUERY SERVICE] Email #{email.id} identified as Query. Marking for manual response.", flush=True)
        
        try:
            # 1. Ensure Category is correct
            email.category = EmailCategory.LOGISTICS_INQUIRY
            
            # 2. Set Status
            # We set it to UNPROCESSED (or keep it there) so the Frontend knows 
            # a human still needs to look at it.
            # We set processed_at to show the Agent has successfully categorized it.
            email.status = EmailStatus.UNPROCESSED 
            email.processed_at = datetime.utcnow()
            
            self.db.commit()
            
            print(f"[QUERY SERVICE] Email #{email.id} saved. Awaiting manual action.", flush=True)
            return True

        except Exception as e:
            print(f"[QUERY SERVICE ERROR] Failed to update query status for email #{email.id}: {str(e)}", flush=True)
            self.db.rollback()
            return False