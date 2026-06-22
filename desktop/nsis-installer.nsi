; DomMaster OS — NSIS Installer
; Сборка единого установщика с бэкендом, фронтендом и лаунчером

!define PRODUCT_NAME "DomMaster OS"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "ZARU Software"
!define PRODUCT_WEB_SITE "https://dommaster.ru"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "dist\DomMasterOS_Setup_${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\DomMaster OS"
InstallDirRegKey HKLM "Software\DomMaster OS" "Install_Dir"
RequestExecutionLevel admin

; Страницы
Page components
Page directory
Page instfiles
UninstPage uninstConfirm
UnPage instfiles

Section "DomMaster OS (обязательно)" SecMain
  SectionIn RO

  ; Установка файлов
  SetOutPath "$INSTDIR"
  File /r "dommaster-dist\backend\*.*"
  File /r "dommaster-dist\frontend\*.*"
  File "dommaster-dist\.env"
  File "dommaster-dist\dommaster.bat"

  ; Создание ярлыков
  CreateDirectory "$SMPROGRAMS\DomMaster OS"
  CreateShortCut "$SMPROGRAMS\DomMaster OS\DomMaster OS.lnk" "$INSTDIR\dommaster.bat" "" "$INSTDIR\dommaster.bat" 0
  CreateShortCut "$DESKTOP\DomMaster OS.lnk" "$INSTDIR\dommaster.bat" "" "$INSTDIR\dommaster.bat" 0

  ; Запись в реестр для удаления
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DomMaster OS" "DisplayName" "DomMaster OS — Строительная ERP"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DomMaster OS" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DomMaster OS" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DomMaster OS" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Desktop интеграция (Python)" SecPython
  SectionIn RO
  ; Python уже встроен в backend .exe
  DetailPrint "Python runtime встроен в backend.exe"
SectionEnd

Section "Создать .env для Supabase (опционально)" SecEnv
  IfFileExists "$INSTDIR\.env" skip_env
    FileOpen $0 "$INSTDIR\.env" w
    FileWrite $0 "# DomMaster OS — Конфигурация$\r$\n"
    FileWrite $0 "TELEGRAM_BOT_TOKEN=$\r$\n"
    FileWrite $0 "SUPABASE_URL=https://ryiejjywpklfloebtaev.supabase.co$\r$\n"
    FileWrite $0 "SUPABASE_SERVICE_KEY=$\r$\n"
    FileClose $0
  skip_env:
SectionEnd

; Язык
LangString DESC_SecMain ${LANG_RUSSIAN} "Основные файлы системы"
LangString DESC_SecPython ${LANG_RUSSIAN} "Python runtime (встроен в backend.exe)"
LangString DESC_SecEnv ${LANG_RUSSIAN} "Файл конфигурации .env"

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_SecMain)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecPython} $(DESC_SecPython)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecEnv} $(DESC_SecEnv)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; Удаление
Section "Uninstall"
  RMDir /r "$INSTDIR"
  RMDir /r "$SMPROGRAMS\DomMaster OS"
  Delete "$DESKTOP\DomMaster OS.lnk"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\DomMaster OS"
SectionEnd
