@echo off
cd /d "%~dp0"
node --watch --watch-preserve-output server.cjs
pause
