@echo off
cd /d "%~dp0"
where py >nul 2>nul && (py collect.py) || (python collect.py)
pause
