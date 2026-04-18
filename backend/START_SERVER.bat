@echo off
REM CYNETWORK PISOWIFI - Backend Startup Script

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║  CYNETWORK PISOWIFI - Admin Backend Server                  ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

REM Check if npm is installed
npm -v >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo After installation, run this script again.
    echo.
    pause
    exit /b 1
)

echo ✓ Node.js is installed
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ ERROR: package.json not found!
    echo.
    echo Make sure you run this script from the backend folder:
    echo C:\Users\Cyrhiel\Documents\CYNETWORK PISOWIFI\backend\
    echo.
    pause
    exit /b 1
)

echo ✓ Backend folder detected
echo.

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    echo.
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
)

echo ✓ Dependencies ready
echo.

REM Start the server
echo Starting CYNETWORK PISOWIFI Backend Server...
echo.

npm start

REM If npm start fails
if errorlevel 1 (
    echo.
    echo ❌ Server failed to start. Check errors above.
    echo.
    pause
    exit /b 1
)

pause
