@echo off
echo ========================================
echo   Starting Project Management System
echo ========================================
echo.

REM Start the backend server
echo [1/3] Starting Backend Server...
cd server
start "Backend Server" cmd /k "npm start"
timeout /t 3 /nobreak >nul

REM Start the frontend client
echo [2/3] Starting Frontend Client...
cd ..\client
start "Frontend Client" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul

REM Open browser
echo [3/3] Opening Browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ========================================
echo   System Started Successfully!
echo ========================================
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5000
echo.
echo   Login Credentials:
echo   - Super User:  EMP-001 / password123
echo   - Employee:    EMP-002 / password123
echo   - Intern:      EMP-003 / password123
echo   - Stock Admin: EMP-004 / password123
echo.
echo Press any key to exit this window...
pause >nul
