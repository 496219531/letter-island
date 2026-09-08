@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto missing
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 goto missing
node launch.mjs
pause
exit /b
:missing
echo Please install Node.js 22 or newer: https://nodejs.org/
echo Then double-click this file again.
pause
