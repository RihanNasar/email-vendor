@echo off
REM Email Vendor System Startup Script for Windows
REM This script activates the virtual environment and starts the system

echo ======================================================================
echo EMAIL VENDOR SYSTEM - STARTUP
echo ======================================================================
echo.

cd /d "%~dp0"

REM Check if virtual environment exists
if not exist "emailvendor\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found!
    echo Please run setup first.
    pause
    exit /b 1
)

REM Activate virtual environment
echo Activating virtual environment...
call emailvendor\Scripts\activate.bat

REM Start the system
echo.
echo Starting Email Vendor System...
echo This will start:
echo   - FastAPI Server (http://localhost:8000)
echo   - Email Monitoring Service
echo.
echo Press CTRL+C to stop
echo.

python start_system.py

pause
