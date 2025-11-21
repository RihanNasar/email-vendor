"""
Unified System Startup Script
Starts both the FastAPI server and the email monitoring service
"""
import asyncio
import subprocess
import sys
import time
from datetime import datetime
import signal
from pathlib import Path

from app.config import settings
from app.models.database import SessionLocal
from app.services.email_service import EmailService


class EmailMonitor:
    """Background email monitoring service"""
    
    def __init__(self, check_interval: int = None):
        self.check_interval = check_interval or settings.email_check_interval
        self.is_running = False
        self.last_check = None
    
    async def start(self):
        """Start the email monitoring loop"""
        print(f"\n{'='*70}")
        print("EMAIL MONITORING SERVICE")
        print(f"{'='*70}")
        print(f"Check interval: {self.check_interval} seconds")
        print(f"Max emails per check: {settings.max_emails_per_check}")
        print(f"Email service: {settings.email_service_type}")
        print(f"{'='*70}\n")
        
        self.is_running = True
        
        # Initial check
        await self.check_emails()
        
        while self.is_running:
            try:
                await asyncio.sleep(self.check_interval)
                await self.check_emails()
            except KeyboardInterrupt:
                print("\n\nStopping email monitor...")
                self.is_running = False
                break
            except Exception as e:
                # Log error but continue running
                try:
                    print(f"\n✗ Error in monitor loop: {str(e)}")
                except:
                    pass  # Ignore print errors
                # Wait before retrying
                await asyncio.sleep(self.check_interval)
    
    async def check_emails(self):
        """Check and process new emails"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        db = SessionLocal()
        try:
            print(f"\n[{timestamp}] Checking for new emails...", flush=True)
            
            email_service = EmailService(db)
            processed_emails = email_service.process_new_emails(
                max_emails=settings.max_emails_per_check
            )
            
            if processed_emails:
                print(f"✓ Processed {len(processed_emails)} email(s):", flush=True)
                for email in processed_emails:
                    print(f"  • {email.sender_email}", flush=True)
                    print(f"    Subject: {email.subject}", flush=True)
                    print(f"    Category: {email.category.value}", flush=True)
                    if email.is_shipping_request:
                        print(f"    → Created shipment session", flush=True)
            else:
                print("  No new emails", flush=True)
            
            self.last_check = datetime.now()
            
        except Exception as e:
            try:
                print(f"\n✗ Error processing emails: {str(e)}", flush=True)
            except:
                pass  # Ignore print errors
        finally:
            db.close()
    
    def stop(self):
        """Stop the monitoring service"""
        self.is_running = False


async def run_monitor():
    """Run the email monitor"""
    monitor = EmailMonitor()
    await monitor.start()


def main():
    """Main entry point"""
    print(f"\n{'='*70}")
    print("EMAIL VENDOR SYSTEM - UNIFIED STARTUP")
    print(f"{'='*70}")
    print(f"Starting at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Environment: {settings.app_env}")
    print(f"{'='*70}\n")
    
    print("Starting services:")
    print("  1. FastAPI Server (http://localhost:8000)")
    print("  2. Email Monitoring Service")
    print(f"\nPress CTRL+C to stop all services\n")
    print(f"{'='*70}\n")
    
    # Start FastAPI server in background
    print("Starting FastAPI server...")
    api_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        text=True,
        bufsize=1
    )
    
    # Wait for API to start
    time.sleep(3)
    print("✓ FastAPI server started\n")
    
    # Set up signal handler for graceful shutdown
    def signal_handler(sig, frame):
        print("\n\nShutting down services...")
        api_process.terminate()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    # Start email monitor
    try:
        asyncio.run(run_monitor())
    except KeyboardInterrupt:
        print("\n\nShutting down services...")
        api_process.terminate()
    finally:
        api_process.wait()
        print("\nAll services stopped.")


if __name__ == "__main__":
    main()
