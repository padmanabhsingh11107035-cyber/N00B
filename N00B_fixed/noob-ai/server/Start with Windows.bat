@echo off
title NOOB AI - start with Windows
rem Makes NOOB AI start by itself whenever you log in to Windows, and start again if it ever stops unexpectedly.
rem Undo it any time with "Don't start with Windows.bat" (or Task Manager > Startup apps > NOOB AI > Disable).
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo  Run "Setup NOOB.bat" first.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" noob_autostart.py --install
echo.
pause
