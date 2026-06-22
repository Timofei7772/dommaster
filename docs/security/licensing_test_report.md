# Отчёт по проверке коммерческого desktop-релиза

**Дата:** 2026-03-27

## Автоматические проверки

### Backend

```powershell
python -m pytest -q tests/test_license_models.py tests/test_license_api.py
```

Покрывает:
- SQLAlchemy-модели лицензии;
- идемпотентную активацию одного и того же устройства;
- отказ при исчерпании лимита слотов.

### Desktop / Node

```powershell
node --test desktop/tests/generate-license.test.js desktop/tests/license-manager.test.js desktop/tests/license-ipc.test.js desktop/tests/feature-gating.test.js desktop/tests/pdf-runtime.test.js
```

Покрывает:
- генерацию branded license key и каноническую сериализацию;
- оффлайн-валидность по подписанному кэшу;
- IPC-совместимость facade-слоя;
- demo gating для PDF и числа смет;
- новый PDF runtime helper:
  - загрузку HTML через временный UTF-8 файл;
  - cleanup временного каталога;
  - нормализацию ошибок `shell.openPath`.

### Frontend

```powershell
npm run build
```

Проверяет согласованность React/TypeScript-кода с Electron IPC-контрактом и отсутствие регрессий после обновления desktop PDF/open-path слоя.

## Проверенные релизные артефакты

В исходниках подготовлены и подлежат включению в installer:
- `docs/client/getting_started.md`
- `docs/client/README.txt`
- `docs/client/starter-db/quick/catalog_simple.json`
- `docs/client/starter-db/full/catalog.json`
- `docs/client/starter-db/full/catalog_rsk.json`
- `docs/client/starter-db/full/regions.json`

## Выполненные сценарии

| Сценарий | Статус | Тип проверки |
| --- | --- | --- |
| Идемпотентная повторная активация того же ПК | Пройдено | Авто |
| Превышение числа слотов активации | Пройдено | Авто |
| Валидация подписанного оффлайн-кэша | Пройдено | Авто |
| Блокировка PDF в demo-режиме | Пройдено | Авто |
| Лимит 3 смет в demo-режиме | Пройдено | Авто |
| Защищённая загрузка HTML для PDF через temp-file helper | Пройдено | Авто |
| Обработка ошибок `shell.openPath` | Пройдено | Авто |
| Совместимость фронтенда с текущим IPC-контрактом | Требует подтверждения командой сборки | Сборка |

## Сценарии, требующие отдельного smoke / UAT

| Сценарий | Статус | Причина |
| --- | --- | --- |
| Реальное открытие PDF на чистой Windows-машине | Требует ручной проверки | Нужен системный PDF viewer и packaged build |
| Реальная печать сметы через packaged installer | Требует ручной проверки | Нужен smoke-test на установленном desktop-приложении |
| Принудительный перенос с деактивацией самого старого слота | Требует ручной проверки | Нужен end-to-end сервер + UI сценарий |
| Поведение packaged build после истечения 7-дневного кэша | Требует ручной проверки | Нужно тестировать на собранном desktop-приложении |
| Реакция на hardware mismatch после изменения железа | Требует ручной проверки | Нужен отдельный стенд или тестовое устройство |
| NSIS installer smoke-test | Требует ручной проверки | Не запускался в этой итерации |

## Вывод

Текущее состояние закрывает:
- ядро коммерческого лицензирования;
- совместимый IPC-контракт;
- защищённый PDF-path для сметы;
- подготовку клиентских инструкций и стартовых баз для поставки.

Перед релизом остаются обязательными:
1. Сборка packaged installer.
2. Ручной smoke-test открытия PDF и сценария печати на Windows.
3. Проверка, что клиентские docs и `starter-db` действительно лежат в установочном пакете.
