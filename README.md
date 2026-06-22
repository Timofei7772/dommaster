# 🏗 ZARU Смета — Профессиональная система сметных расчётов

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-Commercial-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Web-lightgrey.svg)

**Современное решение для автоматизации сметной деятельности с интеграцией искусственного интеллекта**

[Возможности](#-возможности) • [Установка](#-установка) • [Документация](#-документация) • [Поддержка](#-поддержка)

</div>

---

## ✨ Возможности

### 📊 Сметная документация
- **Локальные сметы** — создание, редактирование, автоматический расчёт
- **Объектные и сводные сметы** — иерархическая структура проектов
- **Коммерческие предложения** — генерация КП для заказчиков
- **Шаблоны** — готовые шаблоны для типовых работ

### 📋 Исполнительная документация
- **Акты КС-2** — формирование актов приёмки выполненных работ
- **Справки КС-3** — справки о стоимости выполненных работ
- **Акты М-29** — отчёт о расходе материалов
- **Договоры** — управление договорами подряда с доп. соглашениями

### 🤖 Искусственный интеллект
- **Распознавание смет по фото** — сканирование бумажных документов
- **AI-ассистент** — ответы на вопросы по сметному делу
- **Автогенерация смет** — создание сметы по текстовому описанию
- **Поддержка провайдеров**: Google Gemini, OpenAI GPT-4o, Anthropic Claude

### 📚 Справочники
- **База работ** — более 5000 видов работ с расценками
- **База материалов** — актуальные цены на материалы
- **Региональные коэффициенты** — адаптация под регион

### 📱 Платформы
- **Web-приложение** — работа в браузере
- **Desktop** — автономное Windows-приложение (Electron)
- **Мобильная версия** — адаптивный интерфейс

---

## 🛠 Технологии

| Компонент | Технологии |
|-----------|------------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS |
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy 2.0 |
| **База данных** | SQLite / PostgreSQL |
| **Desktop** | Electron |
| **AI** | Google Gemini API, OpenAI API, Anthropic API |

---

## 📦 Установка и использование

### Для пользователей
1. Скачайте установщик `ZARU Смета Setup 2.0.0.exe`.
2. Установите приложение, следуя инструкциям.
3. Запустите приложение и активируйте лицензию в разделе "Настройки".

### Для разработчиков
1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/your-repo/zaru-smeta.git
   cd zaru-smeta
   ```
2. Установите зависимости и запустите backend:
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
3. Установите зависимости и запустите frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Соберите desktop-приложение:
   ```bash
   cd desktop
   npm install
   npm run build:secure
   ```

### Лицензирование
- Пробная версия: 14 дней.
- Полная версия: активация через ключ в разделе "Настройки".

---

## 📁 Структура проекта

`
ZARU-Smeta/
├── backend/                 # Python FastAPI сервер
│   ├── app/
│   │   ├── main.py          # Точка входа
│   │   ├── models/          # Модели данных
│   │   └── routers/         # API endpoints
│   └── requirements.txt
│
├── frontend/                # React приложение
│   ├── src/
│   │   ├── components/      # UI компоненты
│   │   ├── pages/           # Страницы
│   │   ├── lib/             # Утилиты, AI провайдеры
│   │   └── hooks/           # React хуки
│   └── package.json
│
├── desktop/                 # Electron приложение
│   ├── main.js
│   └── package.json
│
└── README.md
`

---

## 🔧 Конфигурация

### Настройка AI провайдеров

В приложении перейдите: **Настройки → Интеграции**

| Провайдер | Как получить ключ |
|-----------|-------------------|
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic Claude** | [console.anthropic.com](https://console.anthropic.com/) |

### Переменные окружения (Backend)

`nv
DATABASE_URL=sqlite:///./smeta_ai.db
GEMINI_API_KEY=your-key
OPENAI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
`

---

## 📊 API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/estimates` | Список смет |
| POST | `/api/estimates` | Создать смету |
| GET | `/api/estimates/{id}` | Детали сметы |
| POST | `/api/ks2` | Создать акт КС-2 |
| POST | `/api/ks3` | Создать справку КС-3 |
| POST | `/api/ai/chat` | Чат с AI |
| POST | `/api/ai/analyze-photo` | Анализ фото |

Полная документация API: `http://localhost:8000/docs`

---

## 📄 Лицензия

**ZARU Смета** является коммерческим программным обеспечением.

© 2024-2026 ZARU Software. Все права защищены.

Для приобретения лицензии обращайтесь:
- 📧 Email: sales@zaru-smeta.ru
- 📱 Telegram: @zaru_support

---

## 🆘 Поддержка

- **Документация**: [docs.zaru-smeta.ru](https://docs.zaru-smeta.ru)
- **Email**: support@zaru-smeta.ru
- **Telegram**: @zaru_support

---

<div align="center">

**Разработано с ❤️ в России**

</div>
