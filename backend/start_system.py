"""
Unified System Startup Script
-----------------------------
1. Starts the FastAPI Backend Server (Uvicorn)
2. Starts the Background Email Monitoring Service
3. Pipes logs to console immediately (Unbuffered)
4. CRITICAL FIX: Excludes database files from triggering auto-reload
"""
import asyncio
import subprocess
import sys
import time
import os
import signal
from datetime import datetime

# --- Adjust these imports if your project structure is different ---
from app.config import settings
from app.models.database import SessionLocal
from app.services.email_service import EmailService

# --- Console Color Helpers ---
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

class EmailMonitor:
    """Background email monitoring service"""
    
    def __init__(self, check_interval: int = None):
        self.check_interval = check_interval or settings.email_check_interval
        self.is_running = False
    
    async def start(self):
        """Start the email monitoring loop"""
        print(f"{Colors.HEADER}{'='*70}{Colors.ENDC}")
        print(f"{Colors.HEADER}   EMAIL MONITORING SERVICE STARTED{Colors.ENDC}")
        print(f"{Colors.BLUE}   Interval:{Colors.ENDC} {self.check_interval}s")
        print(f"{Colors.BLUE}   Batch Size:{Colors.ENDC} {settings.max_emails_per_check}")
        print(f"{Colors.HEADER}{'='*70}{Colors.ENDC}\n")
        
        self.is_running = True
        
        # Run an immediate check upon startup
        await self.check_emails()
        
        while self.is_running:
            try:
                # Wait for the interval
                await asyncio.sleep(self.check_interval)
                
                # Check again if still running after sleep
                if self.is_running:
                    await self.check_emails()
                    
            except asyncio.CancelledError:
                print(f"\n{Colors.WARNING}Monitor task cancelled.{Colors.ENDC}")
                break
            except Exception as e:
                print(f"{Colors.FAIL}✗ Critical Monitor Loop Error: {str(e)}{Colors.ENDC}")
                # Wait a bit before retrying to prevent rapid error loops
                await asyncio.sleep(10)
    
    async def check_emails(self):
        """Check and process new emails"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        db = SessionLocal()
        
        try:
            print(f"[{timestamp}] 🔍 Checking for new emails...", flush=True)
            
            # Initialize Service with new DB session
            email_service = EmailService(db)
            
            # Run the processing logic
            processed_emails = email_service.process_new_emails(
                max_emails=settings.max_emails_per_check
            )
            
            if processed_emails:
                print(f"{Colors.GREEN}✓ Processed {len(processed_emails)} new email(s){Colors.ENDC}", flush=True)
                for email in processed_emails:
                    # Create a short preview of the subject
                    subject_preview = (email.subject[:50] + '...') if email.subject and len(email.subject) > 50 else email.subject
                    print(f"  • From: {Colors.BOLD}{email.sender_email}{Colors.ENDC} | Subj: {subject_preview}", flush=True)
                    if email.is_shipping_request:
                        print(f"    {Colors.GREEN}→ Created Shipment Session{Colors.ENDC}", flush=True)
            else:
                print("  No new emails found.", flush=True)
            
        except Exception as e:
            # Handle specific database lock errors gracefully in logs
            if "database is locked" in str(e):
                print(f"{Colors.WARNING}⚠ Database locked, skipping check...{Colors.ENDC}", flush=True)
            else:
                print(f"{Colors.FAIL}✗ Error processing emails: {str(e)}{Colors.ENDC}", flush=True)
        finally:
            db.close()

    def stop(self):
        self.is_running = False

async def run_monitor_async():
    """Wrapper to run the monitor"""
    monitor = EmailMonitor()
    await monitor.start()

def main():
    """Main Orchestrator"""
    # 1. SETUP ENVIRONMENT
    # Force Python to use unbuffered I/O so logs appear instantly
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    print(f"\n{Colors.HEADER}{'='*70}{Colors.ENDC}")
    print(f"{Colors.BOLD}   SYSTEM STARTUP: API + MONITOR{Colors.ENDC}")
    print(f"{Colors.HEADER}{'='*70}{Colors.ENDC}")

    # 2. START FASTAPI SERVER (Subprocess)
    # We use subprocess so it runs on a separate CPU core/process than the monitor
    print(f"{Colors.BLUE}ℹ Starting FastAPI Server...{Colors.ENDC}")
    
    # CRITICAL: We explicitly exclude DB files from the reload watcher.
    # This prevents the server from restarting when we write a reply to the DB.
    api_process = subprocess.Popen(
        [
            sys.executable, "-u", "-m", "uvicorn", 
            "app.main:app", 
            "--reload", 
            # --- IGNORE DB FILES TO PREVENT RESTARTS ---
            "--reload-exclude", "*.db", 
            "--reload-exclude", "*.sqlite",
            "--reload-exclude", "*.sqlite3",
            "--reload-exclude", "sql_app.db",
            "--reload-exclude", "*.log",
            # -------------------------------------------
            "--host", "0.0.0.0", 
            "--port", "8000"
        ],
        env=env,
        stdout=sys.stdout,  # Pipe output to this console
        stderr=sys.stderr   # Pipe errors to this console
    )
    
    # Wait a moment to ensure API boots up
    time.sleep(3)
    
    if api_process.poll() is not None:
        print(f"{Colors.FAIL}✗ FastAPI failed to start immediately. Check logs above.{Colors.ENDC}")
        sys.exit(1)
        
    print(f"{Colors.GREEN}✓ FastAPI Server Running (PID: {api_process.pid}){Colors.ENDC}\n")

    # 3. START EMAIL MONITOR (Asyncio Event Loop)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # 4. HANDLE SHUTDOWN SIGNALS (CTRL+C)
    def shutdown_handler(sig, frame):
        print(f"\n\n{Colors.WARNING}Shutting down services...{Colors.ENDC}")
        
        # Kill API Process
        if api_process.poll() is None:
            print("Stopping FastAPI server...")
            api_process.terminate()
            try:
                # Give it 5 seconds to close connections nicely
                api_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                api_process.kill()
        
        print(f"{Colors.GREEN}✓ System Stopped.{Colors.ENDC}")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    try:
        # Run the monitor loop forever until CTRL+C
        loop.run_until_complete(run_monitor_async())
    except KeyboardInterrupt:
        shutdown_handler(None, None)
    finally:
        # Final cleanup safety
        if api_process.poll() is None:
            api_process.terminate()

if __name__ == "__main__":
    main()