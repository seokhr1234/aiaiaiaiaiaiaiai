@echo off
cd /d "%~dp0"
node donghaeng-nav\scripts\launch.mjs
if errorlevel 1 pause
