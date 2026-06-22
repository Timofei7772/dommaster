@echo off
chcp 65001 >nul
cd /d "E:\смета новая 2\Projects\SmetaAI"
"C:\Program Files (x86)\NSIS\makensis.exe" /NOCD "desktop\nsis-installer.nsi"
echo EXIT_CODE=%ERRORLEVEL%
