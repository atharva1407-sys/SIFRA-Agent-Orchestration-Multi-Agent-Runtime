@echo off
title SIFRA Development Server
echo ==============================================
echo       Starting SIFRA Project...
echo ==============================================
cd /d "%~dp0"

echo Starting npm run dev...
start "SIFRA Dev Server" cmd /c "title SIFRA Dev Server & npm run dev"

echo Waiting for the server to initialize...
timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:5173

echo Done! You can close this window.
timeout /t 3 >nul
