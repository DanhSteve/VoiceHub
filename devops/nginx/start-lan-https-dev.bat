@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "NGINX_PREFIX=%CD%"
cd /d "%~dp0..\..\"
set "VH_ROOT=%CD%"
set "CLIENT_DIR=%VH_ROOT%\client"

where nginx >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Khong tim thay nginx trong PATH.
  echo Cai nginx hoac them vao PATH, roi chay lai.
  pause
  exit /b 1
)

if not exist "%CLIENT_DIR%\package.json" (
  echo [ERROR] Khong tim thay client: %CLIENT_DIR%
  pause
  exit /b 1
)

echo.
echo === VoiceHub LAN HTTPS dev ===
echo Nginx prefix: %NGINX_PREFIX%
echo Client:       %CLIENT_DIR%
echo.
echo Luu y: API Gateway :3000 va Docker stack phai dang chay truoc.
echo Truy cap: https://voicehub.local  (can hosts + mkcert CA tren may client)
echo Hosts: CHI 1 dong voicehub.local / may — xem devops\nginx\print-lan-hosts-hint.ps1
echo.

echo [0] Dong bo IP LAN (mediasoup + Vite)...
powershell -ExecutionPolicy Bypass -File "%VH_ROOT%\devops\scripts\sync-lan-dev-ip.ps1" -SkipDockerHint
if errorlevel 1 (
  echo [WARN] sync-lan-dev-ip that bai — kiem tra WiFi roi chay thu cong.
)
echo.

echo [1/2] Khoi dong Nginx HTTPS :443 ...
start "VoiceHub Nginx HTTPS" cmd /k cd /d "%NGINX_PREFIX%" ^&^& nginx -p "%NGINX_PREFIX:\=/%" -c dev-https.conf

timeout /t 2 /nobreak >nul

echo [2/2] Khoi dong Vite dev :5173 ...
cd /d "%CLIENT_DIR%"
call npm run dev -- --port 5173

endlocal
