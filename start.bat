@echo off
set PORT=8080
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is required. Install from https://nodejs.org/
    pause
    exit /b 1
)
echo Starting server on http://localhost:%PORT%
start "Raycaster Server" cmd /c node server.js %PORT%
timeout /t 1 >nul
start "Raycaster" "http://localhost:%PORT%"

