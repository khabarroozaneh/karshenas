@echo off
chcp 65001 >nul
title WordPress Detector Pro v2.0
cd /d "%~dp0"
python app.py
if errorlevel 1 (
    echo.
    echo ❌ Error: Python or libraries not installed!
    echo Please run: pip install customtkinter requests beautifulsoup4
    pause
)