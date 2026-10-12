@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py collect.py
) else (
  python collect.py
)
pause
