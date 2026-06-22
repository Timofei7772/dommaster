# ZARU Смета - Профессиональная сметная программа

## 📁 СТРУКТУРА ХРАНЕНИЯ ДАННЫХ

### Где хранятся файлы программы:

**База данных SQLite:**
```
C:\Users\[Пользователь]\Documents\ZARU Смета\База\smeta.db
```

**Папки проектов:**
```
C:\Users\[Пользователь]\Documents\ZARU Смета\Проекты\[Название проекта]\
  ├── Сметы\
  ├── Договоры\
  ├── КС-2\
  ├── КС-3\
  ├── М-29\
  └── Документы\
```

**Шаблоны документов (встроенные):**
```
[Папка программы]\resources\templates\
  ├── contracts\         - Договоры подряда
  ├── documents\         - М-29, Заявки, Счета
  └── agreements\        - Доп. соглашения
```

**Лицензия:**
```
C:\Users\[Пользователь]\AppData\Roaming\zaru-smeta\license.json
```

**Настройки:**
```
LocalStorage браузера (внутри Electron)
```

---

## 🗄️ СТРУКТУРА БАЗЫ ДАННЫХ

### Таблицы:

1. **projects** - Проекты
   - id, name, description, client, address, folder_path, created_at

2. **estimates** - Сметы
   - id, project_id, name, number, total_cost, overhead, profit, status

3. **estimate_items** - Позиции смет
   - id, estimate_id, code, name, unit, quantity, unit_price, total_price

4. **contracts** - Договоры
   - id, project_id, number, date, client, contractor, amount, status

5. **ks2_acts** - Акты КС-2
   - id, project_id, estimate_id, number, date, period_from, period_to, amount

6. **ks3_certs** - Справки КС-3
   - id, project_id, number, date, amount

7. **m29_docs** - Ведомости М-29
   - id, project_id, estimate_id, number, date, object_name

8. **m29_items** - Позиции М-29
   - id, m29_id, material_name, unit, quantity_norm, quantity_actual, price

9. **settings** - Настройки
   - key, value

---

## 📄 СПИСОК СТРАНИЦ И ФУНКЦИЙ

### Главное меню (слева):

| Страница | Путь | Функционал |
|----------|------|------------|
| Dashboard | /dashboard | Главная панель, статистика, быстрые действия |
| Сметы | /estimates | Список смет, создание, редактирование |
| Новая смета | /estimates/new | Создание сметы с ИИ-подбором |
| Детали сметы | /estimates/:id | Просмотр/редактирование позиций |
| Работы | /works | Справочник работ |
| Материалы | /materials | Справочник материалов |
| КС-2 | /ks2 | Акты выполненных работ |
| КС-3 | /ks3 | Справки о стоимости |
| Договоры | /contracts | Договоры подряда |
| Клиенты | /clients | База клиентов |
| ИИ-помощник | /ai | Чат с AI по сметам |
| AI Сканер | /scanner | Распознавание фото |
| КП | /commercial-proposal | Коммерческие предложения |
| Подрядчики | /contractors | База подрядчиков |
| Рабочие | /workers | База рабочих |
| Заявки | /material-requests | Заявки на материалы |
| Справочники | /references | ГЭСН, ФЕР, ТЕР |
| Документы | /documents | Все документы |
| Календарь | /calendar | График проектов |
| М-29 | /m29 | Ведомости материалов |
| Шаблоны | /templates | Шаблоны из Смета 2007 |
| Настройки | /settings | API ключи, настройки |

---

## 🔐 СИСТЕМА ЛИЦЕНЗИРОВАНИЯ

### Типы лицензий:

| Тип | Срок | Функции |
|-----|------|---------|
| TRIAL | 14 дней | Базовые функции |
| BASIC | 1 год | + Документы |
| PRO | 1 год | + AI, Экспорт |
| ENTERPRISE | 1 год | + API, Многопользователь |

### Формат ключа:
```
ZARU-XXXX-XXXX-XXXX-PRO
```

### Файл лицензии (license.json):
```json
{
  "key": "ZARU-XXXX-XXXX-XXXX-PRO",
  "email": "user@email.com",
  "type": "PRO",
  "features": ["basic", "documents", "ai", "export"],
  "activatedAt": "2026-01-12T10:00:00Z",
  "expiresAt": "2027-01-12T10:00:00Z"
}
```

---

## 🛠️ ТЕХНИЧЕСКИЙ СТЕК

### Frontend:
- React 18 + TypeScript
- Vite (сборка)
- TailwindCSS (стили)
- TanStack Query (кэширование)
- Recharts (графики)
- React Router (навигация)

### Desktop (Electron):
- Electron 28
- sql.js (SQLite в JS)
- ExcelJS (Excel файлы)
- docxtemplater (Word файлы)

### AI:
- Google Gemini API (gemini-1.5-flash)
- Распознавание фото
- Генерация смет по описанию
- Чат-ассистент

---

## 📋 АУДИТ ФУНКЦИОНАЛА

### ✅ Работает:
- [x] Создание проектов
- [x] Создание/редактирование смет
- [x] Добавление позиций в смету
- [x] Расчёт итогов (накладные, прибыль, НДС)
- [x] Генерация КС-2, КС-3, М-29
- [x] Экспорт в Excel
- [x] AI Сканер (с retry логикой)
- [x] AI Чат
- [x] Шаблоны документов
- [x] Настройки API ключа
- [x] Тёмная тема

### ⚠️ Требует внимания:
- [ ] Лицензирование (базовое, без защиты)
- [ ] Онлайн-проверка лицензии
- [ ] Обфускация кода
- [ ] Автообновления

---

## 🔒 БЕЗОПАСНОСТЬ

### Текущая защита:
1. Лицензия хранится локально в зашифрованном JSON
2. API ключ хранится в base64 (не plaintext)
3. Нет сетевых запросов кроме Gemini API

### Рекомендации для усиления:
1. Обфускация JS кода (javascript-obfuscator)
2. Привязка к HWID (hardware ID)
3. Онлайн-проверка лицензии через сервер
4. Подпись кода (code signing certificate)

---

## 📦 СБОРКА И РАСПРОСТРАНЕНИЕ

### Сборка установщика:
```bash
cd C:\Projects\SmetaAI\desktop
npm run build:win
```

### Результат:
```
desktop\dist\ZARU Смета Setup 1.0.0.exe  (~85 MB)
```

### Требования к ПК пользователя:
- Windows 10/11 (64-bit)
- 4 GB RAM
- 500 MB свободного места
- Интернет (для AI функций)

---

## 🆚 СРАВНЕНИЕ С СМЕТА 2007

| Функция | Смета 2007 | ZARU Смета |
|---------|------------|------------|
| База данных | Access (.accdb) | SQLite (.db) |
| Интерфейс | Windows Forms | Современный React |
| AI | ❌ | ✅ Gemini |
| Фото → Смета | ❌ | ✅ |
| Тёмная тема | ❌ | ✅ |
| Шаблоны | ✅ .dotx/.xltx | ✅ (импортированы) |
| Лицензия | Serial key | Online check |
| Обновления | Ручные | Автоматические |
