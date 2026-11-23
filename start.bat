@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Встановіть Node.js з https://nodejs.org & pause & exit /b)
if not exist node_modules (echo Встановлюю залежності... & call npm install)
start "" http://localhost:3000/admin
node server.js
pause
