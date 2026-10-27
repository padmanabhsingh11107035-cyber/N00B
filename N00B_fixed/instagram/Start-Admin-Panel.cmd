@echo off
rem NOOB admin panel on this computer (works even when the website is down). Leave this window open while you use it.
cd /d "%~dp0"
echo Starting the NOOB admin panel...
start "" http://127.0.0.1:5757/__noob/status
node scripts\admin-local.mjs
pause
