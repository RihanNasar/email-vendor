# Email Vendor System Startup Script for PowerShell
# This script activates the virtual environment and starts the system

Write-Host "======================================================================"
Write-Host "EMAIL VENDOR SYSTEM - STARTUP"
Write-Host "======================================================================"
Write-Host ""

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Check if virtual environment exists
if (-not (Test-Path "emailvendor\Scripts\Activate.ps1")) {
    Write-Host "ERROR: Virtual environment not found!" -ForegroundColor Red
    Write-Host "Please run setup first."
    pause
    exit 1
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Cyan
& .\emailvendor\Scripts\Activate.ps1

# Start the system
Write-Host ""
Write-Host "Starting Email Vendor System..." -ForegroundColor Green
Write-Host "This will start:" -ForegroundColor Yellow
Write-Host "  - FastAPI Server (http://localhost:8000)" -ForegroundColor Yellow
Write-Host "  - Email Monitoring Service" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press CTRL+C to stop" -ForegroundColor Cyan
Write-Host ""

python start_system.py
