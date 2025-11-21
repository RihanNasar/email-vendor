import asyncio
import time
from typing import Optional
from datetime import datetime

from app.config import settings
from app.models.database import SessionLocal
from app.services.outlook_service import outlook_service
from app.services.email_service import EmailService


class EmailMonitor:
    """Background service for monitoring Outlook inbox"""
    
    def __init__(self, check_interval: int = None):
        self.check_interval = check_interval or settings.email_check_interval
        self.outlook_service = outlook_service
        self.is_running = False
        self.last_check: Optional[datetime] = None
    
    async def start(self):
        """Start the email monitoring service"""
        print(f"Starting email monitor (check interval: {self.check_interval}s)")
        
        # Authenticate with Outlook
        if not self.outlook_service.authenticate():
            print("Failed to authenticate with Outlook. Please run authentication first.")
            return
        
        self.is_running = True
        
        while self.is_running:
            try:
                await self.check_emails()
                await asyncio.sleep(self.check_interval)
            except KeyboardInterrupt:
                print("\nStopping email monitor...")
                self.is_running = False
                break
            except Exception as e:
                print(f"Error in email monitor: {str(e)}")
                await asyncio.sleep(60)  # Wait a minute before retrying
    
    async def check_emails(self):
        """Check for new emails and process them"""
        print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking for new emails...")
        
        db = SessionLocal()
        try:
            email_service = EmailService(db)
            
            # Process new emails
            processed_emails = email_service.process_new_emails(
                max_emails=settings.max_emails_per_check
            )
            
            if processed_emails:
                print(f"Processed {len(processed_emails)} new email(s)")
                
                for email in processed_emails:
                    print(f"  - {email.sender_email}: {email.subject}")
                    print(f"    Category: {email.category.value}")
                    print(f"    Shipping Request: {email.is_shipping_request}")
            else:
                print("No new emails to process")
            
            self.last_check = datetime.now()
            
        except Exception as e:
            print(f"Error processing emails: {str(e)}")
        finally:
            db.close()
    
    def stop(self):
        """Stop the email monitoring service"""
        self.is_running = False


async def main():
    """Main entry point for the monitor"""
    monitor = EmailMonitor()
    await monitor.start()


if __name__ == "__main__":
    asyncio.run(main())
