@echo off
rem SkillSuperTracker 双击启动器：展示默认会话根下最近 10 个会话
rem 附加参数会追加到默认参数之后（例如：skillsupertracker.bat --recent 5）
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ^(>=22.15^) not found in PATH
  pause
  exit /b 1
)
if not exist packages\cli\dist\cli.js (
  echo dist missing, building once ^(npm run build^)...
  call npm run build
  if errorlevel 1 (
    echo build failed
    pause
    exit /b 1
  )
)
node packages\cli\dist\cli.js analyze --recent 10 --open %*
if errorlevel 1 pause
