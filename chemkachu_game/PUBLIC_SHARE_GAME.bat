@echo off
chcp 65001 >nul
title MO LINK CONG KHAI CHO KHACH HANG - CHEMKACHU (ZERO INSTALL)
color 0A

:: ============================================================================
:: 1. BAT NGAM APACHE (CONG 80) & MYSQL (CONG 3306) TREN MAY EM
:: ============================================================================
set "LARAGON_DIR=F:\john-j2n7-storre\Software_2\laragon\laragon"
set "HTTPD_EXE="
set "MYSQLD_EXE="
for /f "delims=" %%F in ('dir /b /s "%LARAGON_DIR%\bin\apache\httpd.exe" 2^>nul') do set "HTTPD_EXE=%%F"
for /f "delims=" %%F in ('dir /b /s "%LARAGON_DIR%\bin\mysql\mysqld.exe" 2^>nul') do set "MYSQLD_EXE=%%F"

netstat -ano | findstr ":80 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 if defined HTTPD_EXE start "" /B "%HTTPD_EXE%" >nul 2>&1

netstat -ano | findstr ":3306 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 if defined MYSQLD_EXE start "" /B "%MYSQLD_EXE%" >nul 2>&1

echo [1/2] Server Apache + MySQL tren may chu da san sang!

:: ============================================================================
:: 2. TAO LINK HTTPS CONG KHAI BANG SSH CO SAN TREN WINDOWS
:: ============================================================================
echo [2/2] Dang tao duong ham HTTPS cong khai (khong can cai them app)...
echo.
echo ============================================================================
echo   COPY LINK "https://....lhr.life" HIEN RA BEN DUOI VA NOI THEM:
echo   /chemkachu_game/chemistry-app.html
echo   (Vi du: https://abc123xyz.lhr.life/chemkachu_game/chemistry-app.html)
echo   LUU Y: Giu cua so den nay mo trong suot luc khach hang choi!
echo ============================================================================
echo.

ssh -o StrictHostKeyChecking=no -R 80:localhost:80 nokey@localhost.run
pause