# Подпись EXE сертификатом

## 📜 Зачем нужна подпись?
- Windows не показывает предупреждение "Неизвестный издатель"
- Антивирусы меньше ложных срабатываний
- Профессиональный вид продукта

## 🔑 Варианты сертификатов

### 1. Бесплатный (самоподписанный)
```powershell
# Создать самоподписанный сертификат
New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My -Type CodeSigningCert -Subject "CN=ZARU Software"
```
**Минус**: Windows всё равно покажет предупреждение

### 2. Платный (рекомендуется для продажи)
| Провайдер | Цена/год | Время выдачи |
|-----------|----------|--------------|
| Sectigo (Comodo) | ~$80 | 1-3 дня |
| DigiCert | ~$500 | 1 день |
| GlobalSign | ~$300 | 1-2 дня |

## 🛠 Настройка в electron-builder

### package.json (desktop)
```json
{
  "build": {
    "win": {
      "signingHashAlgorithms": ["sha256"],
      "certificateFile": "./cert/code-signing.pfx",
      "certificatePassword": "your-password"
    }
  }
}
```

### Или через переменные среды:
```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
npx electron-builder --win
```

## 📋 Порядок подписи

1. **Купить сертификат** (Sectigo ~ $80/год)
2. **Получить PFX файл** от провайдера
3. **Добавить в проект** `desktop/cert/code-signing.pfx`
4. **Настроить package.json** с путём к сертификату
5. **Пересобрать EXE**: `npx electron-builder --win`

## ⚠️ Важно
- Не храните пароль сертификата в репозитории!
- Используйте переменные среды для CI/CD
- Сертификат действует 1-3 года
