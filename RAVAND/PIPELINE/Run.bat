@echo off
chcp 65001 >nul
title وردپرس جو — خط لوله تولید لید
cd /d "%~dp0"

echo ============================================================
echo   خط لوله تولید لید وردپرسی — از بانک اکسل تا پنل کارشناس
echo ============================================================
echo.

REM --- بررسی پیش‌نیازها ---
where python >nul 2>&1 || ( echo [X] پایتون نصب نیست. نصب کنید: https://python.org & pause & exit /b 1 )
where node   >nul 2>&1 || ( echo [X] نود جی‌اس نصب نیست. نصب کنید: https://nodejs.org & pause & exit /b 1 )

python -c "import openpyxl" >nul 2>&1 || (
  echo [!] کتابخانه openpyxl نصب نیست. نصب می‌کنیم ...
  pip install openpyxl || ( echo [X] نصب openpyxl ناموفق بود & pause & exit /b 1 )
)

REM --- پرسش حالت اجرا ---
echo حالت اجرا را انتخاب کنید:
echo   1 = پنل خط لوله ، انتخاب بانک از داخل پنل (پیشنهادی)
echo   2 = اجرای کامل با بانک پیش‌فرض ، تشخیص وردپرس + تست سرعت
echo   3 = بازسازی فید ، فقط از نتایج ذخیره‌شده ، سریع
echo   4 = سرور محلی ، فقط پنل‌ها را سرو می‌کند
echo.
set "MODE=1"
set /p "MODE=انتخاب 1 یا 2 یا 3 یا 4 : "

if "%MODE%"=="4" goto serve
if "%MODE%"=="3" goto cached
if "%MODE%"=="2" goto full

goto panel

:panel
echo.
echo --- پنل خط لوله روی http://127.0.0.1:8124 شروع می‌شود ---
echo از داخل پنل، بانک را انتخاب و اجرا کنید.
echo.
python panel.py
goto done

:full
set BANK=..\1\DATA\1-235.xlsx
if not exist "%BANK%" ( echo [X] فایل بانک پیدا نشد: %BANK% & pause & exit /b 1 )
echo بانک: %BANK%
echo.
echo --- مرحله ۱: تشخیص سایت‌های وردپرسی ---
echo --- مرحله ۲: تست سرعت (Lighthouse) ---
echo --- کش نتایج در OUTPUT/speed_cache.json ذخیره می‌شود ---
echo.
python pipeline.py --bank "%BANK%" || ( echo [X] خط لوله خطا داد & pause & exit /b 1 )
goto done

:cached
echo.
echo --- بازسازی فید از کش (بدون تست زنده) ---
python pipeline.py --bank "%BANK%" --cached-only || ( echo [X] خط لوله خطا داد & pause & exit /b 1 )
goto done

:done
echo.
echo ============================================================
echo   فید پنل کارشناس آماده است:
echo     OUTPUT\secretary_feed.json
echo   گزارش کامل خط لوله:
echo     OUTPUT\pipeline_report.json
echo   کش نتایج سرعت (برای اجرای سریع بعدی):
echo     OUTPUT\speed_cache.json
echo ============================================================
echo.

:serve
REM --- سرور محلی برای پنل کارشناس ---
cd /d "%~dp0..\.."
echo سرور محلی روی http://127.0.0.1:8123 شروع می‌شود ...
echo.
echo   پنل کارشناس: http://127.0.0.1:8123/wpjoo-expert-app/
echo.
echo برای توقف، این پنجره را ببندید.
echo.
start "" "http://127.0.0.1:8123/wpjoo-expert-app/"
python -m http.server 8123
