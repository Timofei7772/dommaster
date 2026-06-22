@echo off
chcp 65001 >nul
echo.
echo ═══════════════════════════════════════════════════════════════════
echo    ZARU Смета - Сборка защищённой версии (Production)
echo ═══════════════════════════════════════════════════════════════════
echo.

cd /d "%~dp0desktop"

echo [1/5] Установка зависимостей...
call npm install >nul 2>&1

echo [2/5] Обфускация системы защиты...
call npm run obfuscate
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Ошибка обфускации!
    pause
    exit /b 1
)

echo [3/5] Сборка frontend...
cd /d "%~dp0frontend"
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Ошибка сборки frontend!
    pause
    exit /b 1
)

echo [4/5] Сборка EXE...
cd /d "%~dp0desktop"
call npx electron-builder --win
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Ошибка сборки EXE!
    pause
    exit /b 1
)

echo [5/5] Копирование документации в дистрибутив...
cd /d "%~dp0"
if exist "release\README.md" (
    copy /Y "release\README.md" "desktop\dist\" >nul 2>&1
)

echo.
echo ═══════════════════════════════════════════════════════════════════
echo    ✅ Сборка завершена успешно!
echo ═══════════════════════════════════════════════════════════════════
echo.
echo    Готовый EXE находится в папке: desktop\dist
echo.
echo    ⚠️  НЕ ЗАБУДЬТЕ:
echo    - Файл tools\keygen.js НЕ включать в дистрибутив
echo    - Хранить секретные ключи в безопасности
echo    - Проверить работу лицензии перед выпуском
echo.

pause

