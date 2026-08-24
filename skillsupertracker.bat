@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ^(>=22.15^) not found in PATH
  pause
  exit /b 1
)
node packages\cli\dist\cli.js analyze --open %*
if errorlevel 1 pause
