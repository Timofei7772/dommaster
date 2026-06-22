@echo off
chcp 65001 >nul
title DomMaster OS — Запуск

echo ═══════════════════════════════════════════════════════
echo   🏗️  DomMaster OS v1.0 — Строительная ERP
echo   ⚡ Ремонт квартир и коттеджей
echo ═══════════════════════════════════════════════════════
echo.

cd /d "%~dp0"

:: ========== Проверка Python ==========
set PYTHON=python
where python >nul 2>&1 || set PYTHON=python3
where %PYTHON% >nul 2>&1 || (
    if exist "backend\venv\Scripts\python.exe" (
        set PYTHON=backend\venv\Scripts\python.exe
    ) else (
        echo ❌ Python не найден!
        echo    Установите Python 3.10+: https://www.python.org/downloads/
        echo    Или: winget install Python.Python.3.10
        pause
        exit /b 1
    )
)

:: ========== Проверка зависимостей ==========
echo [1/4] Установка зависимостей...
if not exist "backend\venv" "%PYTHON%" -m venv backend\venv
call backend\venv\Scripts\activate.bat
pip install -q --upgrade pip 2>nul
pip install -q uvicorn fastapi sqlalchemy aiosqlite pydantic pydantic-settings openpyxl httpx python-multipart python-jose passlib[bcrypt] bcrypt python-telegram-bot 2>nul
echo    ✅ Зависимости готовы

:: ========== База данных ==========
echo [2/4] Инициализация БД...
cd backend
if not exist "smeta_ai.db" (
    %PYTHON% -c "import asyncio; from database import engine, Base; asyncio.run(engine.run_sync(Base.metadata.create_all)); print('DB created')" 2>nul
)
cd ..
echo    ✅ База данных готова

:: ========== Запуск сервера ==========
echo [3/4] Запуск сервера...
start "DomMaster API" /B cmd /c "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level warning"

echo    ⏳ Ожидание запуска...
:wait_loop
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:8000/ >nul 2>&1
if errorlevel 1 goto wait_loop
echo    ✅ API: http://localhost:8000

:: ========== Запуск интерфейса ==========
echo [4/4] Запуск интерфейса...
if exist "frontend\dist\index.html" (
    start "" "http://localhost:8000"
) else (
    start "DomMaster UI" /B cmd /c "cd /d "%~dp0frontend" && npm run dev -- --host 127.0.0.1"
    timeout /t 3 /nobreak >nul
    start "" "http://localhost:5173"
)
echo    ✅ Интерфейс открыт

echo.
echo ═══════════════════════════════════════════════════════
echo   🏗️  DomMaster OS — ЗАПУЩЕНА!
echo.
echo   🌐 Интерфейс: http://localhost:5173
echo   ⚙️  API:       http://localhost:8000
echo   📋 Документация: http://localhost:8000/docs
echo.
echo   ❌ Закройте это окно для остановки
echo ═══════════════════════════════════════════════════════
echo.
pause >nul

:: ========== Остановка ==========
echo.
echo ⏹  Остановка...
taskkill /f /im uvicorn.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
echo ✅ Остановлено.
