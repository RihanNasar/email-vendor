from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # App Configuration
    app_name: str = "Email Vendor Agent"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = True
    
    # Database Configuration
    database_url: str
    database_host: str = "localhost"
    database_port: int = 5432
    database_name: str = "emailvendor"
    database_user: str = "user"
    database_password: str = "password"
    
    # Email Service Configuration
    email_service_type: str = "smtp"  # Options: "outlook", "gmail", "smtp"
    
    # Microsoft Outlook API
    outlook_client_id: str = ""
    outlook_client_secret: str = ""
    outlook_tenant_id: str = "common"  # Use 'common' for personal accounts
    outlook_redirect_uri: str = "http://localhost:8000/auth/callback"
    outlook_scopes: str = "https://graph.microsoft.com/Mail.Read,https://graph.microsoft.com/Mail.Send,https://graph.microsoft.com/Mail.ReadWrite"
    
    # SMTP/IMAP Configuration
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    imap_server: str = "imap.gmail.com"
    imap_port: int = 993
    email_address: str
    email_password: str
    email_use_ssl: bool = True
    
    # OpenAI
    openai_api_key: str
    
    # Email Monitoring
    email_check_interval: int = 30  # seconds
    max_emails_per_check: int = 50
    
    @property
    def outlook_scopes_list(self) -> List[str]:
        return self.outlook_scopes.split(",")
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
