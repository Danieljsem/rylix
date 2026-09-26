@echo off
rem Spusti Rylix a otevre ho v prohlizeci.
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:3000"
node --env-file-if-exists=.env src\server.js
pause
