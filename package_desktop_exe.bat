@echo off
chcp 65001 >nul
title DomMaster OS — Сборка установщика

echo ═══════════════════════════════════════════════════════
echo   🏗️  DomMaster OS — Сборка единого EXE
echo ═══════════════════════════════════════════════════════
echo.

cd /d "%~dp0"

:: ========== ШАГ 1: Собрать бэкенд в .exe ==========
echo [1/4] Сборка Python-бэкенда в EXE...
cd backend
call venv\Scripts\activate.bat
if not exist "dist\dommaster-backend\dommaster-backend.exe" (
    echo    PyInstaller сборка (первый запуск — долго)...
    pyinstaller --onedir --name dommaster-backend ^
        --collect-all passlib --collect-all bcrypt ^
        --hidden-import app.main --hidden-import app.config --hidden-import app.database ^
        --hidden-import app.models --hidden-import app.models.estimate ^
        --hidden-import app.models.project --hidden-import app.models.user ^
        --hidden-import app.models.work_stage --hidden-import app.models.deal ^
        --hidden-import app.models.local_price --hidden-import app.models.client ^
        --hidden-import app.models.erp_models ^
        --hidden-import app.routers --hidden-import app.routers.competitor_analysis ^
        --hidden-import app.routers.handwriting_ocr --hidden-import app.routers.director_dashboard ^
        --hidden-import app.routers.local_prices --hidden-import app.routers.telegram_webhook ^
        --hidden-import app.routers.estimates --hidden-import app.routers.works ^
        --hidden-import app.routers.materials --hidden-import app.routers.clients ^
        --hidden-import app.ai.agents --hidden-import app.ai.agents.estimate_comparator_agent ^
        --hidden-import app.ai.agents.handwriting_ocr_agent --hidden-import app.ai.agents.price_localizer_agent ^
        --hidden-import app.ai.agents.estimate_validator_agent --hidden-import app.ai.base_agent ^
        --hidden-import app.ai.llm_provider --hidden-import app.ai.prompts ^
        --hidden-import app.telegram_bot ^
        --hidden-import openpyxl --hidden-import aiosqlite --hidden-import httpx ^
        --hidden-import multipart --hidden-import uvicorn --hidden-import jose ^
        --hidden-import passlib --hidden-import sqlalchemy --hidden-import pydantic ^
        --hidden-import pydantic_settings --hidden-import email_validator ^
        --add-data "app;app" ^
        --console run.py
    if !ERRORLEVEL! NEQ 0 (
        echo ❌ Ошибка сборки бэкенда!
        pause
        exit /b 1
    )
) else (
    echo    ✅ Бэкенд уже собран
)
cd ..

:: ========== ШАГ 2: Собрать фронтенд ==========
echo [2/4] Сборка фронтенда...
cd frontend
if not exist "dist\index.html" (
    call npm run build
    if !ERRORLEVEL! NEQ 0 (
        echo ❌ Ошибка сборки фронтенда!
        pause
        exit /b 1
    )
) else (
    echo    ✅ Фронтенд уже собран
)
cd ..

:: ========== ШАГ 3: Скопировать всё в desktop ==========
echo [3/4] Подготовка дистрибутива...
set DIST_DIR=desktop\dommaster-dist
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%DIST_DIR%\backend"
mkdir "%DIST_DIR%\frontend"

:: Копируем бэкенд
xcopy /E /I /Y "backend\dist\dommaster-backend" "%DIST_DIR%\backend\" >nul
:: Копируем .env
copy /Y ".env" "%DIST_DIR%\.env" >nul
:: Копируем фронтенд
xcopy /E /I /Y "frontend\dist" "%DIST_DIR%\frontend\" >nul

:: Копируем лаунчер
copy /Y "dommaster.bat" "%DIST_DIR%\dommaster.bat" >nul

:: ========== ШАГ 4: Собрать установщик ==========
echo [4/4] Сборка NSIS установщика...
if exist "C:\Program Files (x86)\NSIS\makensis.exe" (
    makensis /NOCD desktop\nsis-installer.nsi
    echo    ✅ Установщик готов: desktop\dist\DomMasterOS_Setup.exe
) else (
    echo.
    echo ⚠️  NSIS не найден. Установите NSIS: https://nsis.sourceforge.io
    echo    Или запускайте через: desktop\dommaster-dist\dommaster.bat
)

echo.
echo ═══════════════════════════════════════════════════════
echo   ✅ Сборка завершена!
echo.
echo   📁 Дистрибутив: %DIST_DIR%
echo   🚀 Быстрый запуск: %DIST_DIR%\dommaster.bat
echo ═══════════════════════════════════════════════════════
pause
