@echo off
chcp 65001 >nul
title تست سرعت سایت‌ها
cd /d "%~dp0"
python app.py
if errorlevel 1 (
    echo.
    echo ❌ خطا: پایتون یا کتابخانه‌ها نصب نیستند!
    echo اجرا کنید: pip install customtkinter openpyxl
    pause
)
