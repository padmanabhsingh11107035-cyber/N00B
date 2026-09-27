@echo off
title NOOB AI - don't start with Windows
rem NOOB AI will no longer start by itself when you log in to Windows (open it with "NOOB App.bat" instead).
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo  Nothing to do: NOOB is not set up on this PC.
    pause
    exit /b 0
)
".venv\Scripts\python.exe" noob_autostart.py --remove
echo.
pause
