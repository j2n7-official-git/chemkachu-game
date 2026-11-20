@echo off
chcp 65001 >nul
title KHOI DONG DU AN CHEMKACHU (LARAGON + MYSQL + WEB)
color 0B

:: ============================================================================
:: 1. TU DONG DO TIM THU MUC LARAGON (UU TIEN DUONG DAN THUC TE & QUET DU PHONG)
:: ============================================================================
set "LARAGON_DIR="

:: Kiem tra ngay duong dan Laragon tren may hien tai
if exist "F:\john-j2n7-storre\Software_2\laragon\laragon\laragon.exe" (
    set "LARAGON_DIR=F:\john-j2n7-storre\Software_2\laragon\laragon"
    goto :FOUND_LARAGON
)

:: Du phong: Neu Laragon dang bat san, lay truc tiep duong dan tu tien trinh Windows
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "(Get-Process laragon -ErrorAction SilentlyContinue | Select-Object -First 1).Path"`) do (
    if exist "%%~dpPlaragon.exe" (
        set "LARAGON_DIR=%%~dpP"
        set "LARAGON_DIR=%LARAGON_DIR:~0,-1%"
        goto :FOUND_LARAGON
    )
)

:: Du phong khi mang sang may thay/co (quet C:\laragon, D:\laragon, E:\laragon, F:\laragon)
for %%D in (C D E F) do (
    if exist "%%D:\laragon\laragon.exe" (
        set "LARAGON_DIR=%%D:\laragon"
        goto :FOUND_LARAGON
    )
)

echo [LOI] Khong tim thay laragon.exe! Vui long mo Laragon 1 lan hoac kiem tra duong dan.
pause
exit /b

:FOUND_LARAGON
echo [1/4] Da tim thay Laragon tai: %LARAGON_DIR%

:: ============================================================================
:: 2. KHOI DONG TRUC TIEP APACHE (HTTPD.EXE) & MYSQL (MYSQLD.EXE) CHAY NGAM
:: ============================================================================
echo [2/4] Dang bat truc tiep Apache (80/443) va MySQL (3306)...

:: Tim file httpd.exe va mysqld.exe ben trong thu muc Laragon
set "HTTPD_EXE="
set "MYSQLD_EXE="
for /f "delims=" %%F in ('dir /b /s "%LARAGON_DIR%\bin\apache\httpd.exe" 2^>nul') do set "HTTPD_EXE=%%F"
for /f "delims=" %%F in ('dir /b /s "%LARAGON_DIR%\bin\mysql\mysqld.exe" 2^>nul') do set "MYSQLD_EXE=%%F"

:: Bat Apache neu cong 80 chua mo
netstat -ano | findstr ":80 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    if defined HTTPD_EXE (
        start "" /B "%HTTPD_EXE%"
        echo       -> Da kich hoat Apache!
    ) else (
        echo [LOI] Khong tim thay httpd.exe trong %LARAGON_DIR%\bin\apache
    )
)

:: Bat MySQL neu cong 3306 chua mo
netstat -ano | findstr ":3306 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    if defined MYSQLD_EXE (
        start "" /B "%MYSQLD_EXE%" >nul 2>&1
        echo       -> Da kich hoat MySQL!
    ) else (
        echo [LOI] Khong tim thay mysqld.exe trong %LARAGON_DIR%\bin\mysql
    )
)

:: Doi MySQL mo cong 3306 (toi da 15 giay)
set /a RETRY=0
:WAIT_MYSQL
netstat -ano | findstr ":3306 " | findstr "LISTENING" >nul
if %errorlevel%==0 goto :MYSQL_READY

set /a RETRY+=1
if %RETRY% GEQ 15 (
    echo [LOI] MySQL khong mo duoc cong 3306. Kiem tra lai thu muc Laragon!
    pause
    exit /b
)
timeout /t 1 /nobreak >nul
goto :WAIT_MYSQL

:MYSQL_READY
echo       -> MySQL (Cong 3306) da san sang!

:: ============================================================================
:: 3. TU DONG TIM MYSQL.EXE & NAP FILE CHEMKACHU_DB.SQL
:: ============================================================================
echo [3/4] Dang kiem tra va nap co so du lieu chemkachu_db.sql...
set "MYSQL_EXE="
for /f "delims=" %%F in ('dir /b /s "%LARAGON_DIR%\bin\mysql\mysql.exe" 2^>nul') do (
    set "MYSQL_EXE=%%F"
)

set "SQL_FILE=%~dp0chemkachu_db.sql"

if defined MYSQL_EXE (
    if exist "%SQL_FILE%" (
        "%MYSQL_EXE%" -u root < "%SQL_FILE%"
        if %errorlevel%==0 (
            echo       -> Da nap thanh cong database tu chemkachu_db.sql!
        ) else (
            echo [LOI] Khong the nap SQL. Kiem tra lai mat khau root MySQL.
        )
    ) else (
        echo [CANH BAO] Khong tim thay file chemkachu_db.sql cung thu muc!
    )
) else (
    echo [CANH BAO] Khong tim thay mysql.exe trong %LARAGON_DIR%\bin\mysql
)

:: ============================================================================
:: 4. MO TRINH DUYET VAO THANG GAME CHEMKACHU
:: ============================================================================
echo [4/4] Dang mo giao dien game CHEMKACHU tren trinh duyet...
timeout /t 1 /nobreak >nul
start "" "https://localhost/chemkachu_game/chemistry-app.html"

echo.
echo ============================================================================
echo   HOAN TAT! Game dang chay. Khong tat cua so Laragon khi dang choi.
echo ============================================================================
timeout /t 3 /nobreak >nul
exit