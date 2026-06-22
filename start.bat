@echo off
chcp 65001 >nul
title ZARU Смета - Запуск

echo.
echo =========================================
echo       ZARU Смета - Desktop v2.0
echo =========================================
echo.

echo [1/2] Запуск Frontend сервера...
cd /d "%~dp0frontend"
start "ZARU Frontend" /min cmd /k "npm run dev"

echo [2/2] Ожидание запуска сервера (8 сек)...
timeout /t 8 /nobreak >nul

echo [3/3] Запуск Electron приложения...
cd /d "%~dp0desktop"
start "ZARU Electron" npm start

echo.
echo =========================================
echo   Приложение запущено!
echo   Frontend: http://localhost:3000
echo =========================================
echo.
echo Нажмите любую клавишу для завершения всех процессов...
pause >nul

taskkill /FI "WINDOWTITLE eq ZARU*" /F >nul 2>&1
