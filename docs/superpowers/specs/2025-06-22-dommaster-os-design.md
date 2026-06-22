# DomMaster OS — Архитектура системы

## Стратегия

**Не переписываем, а эволюционируем.** Существующий код — 2+ года работы, 50+ страниц, 12 AI-агентов, сметный движок. Сохраняем весь Python/FastAPI бэкенд, модернизируем фронтенд точечно, добавляем новые модули.

## Стек

| Слой | Текущее | Добавляем |
|------|---------|-----------|
| Фронтенд | React 18 + Vite + Tailwind | Shadcn UI, Supabase SDK, new modules |
| Бэкенд | FastAPI + SQLAlchemy + SQLite | Supabase (параллельно для CRM) |
| AI | OpenAI/Gemini/Claude | Новые агенты (конкуренты, OCR) |
| Desktop | Electron | Улучшенный билд + автообновления |
| Мобильное | Telegram-бот | python-telegram-bot |

## Модули (порядок реализации)

### Phase 1 — Фундамент
- ✅ Shadcn UI + дизайн-система
- ✅ Supabase интеграция
- ✅ Модернизация навигации

### Phase 2 — Киллер-фичи
- ✅ **Анализатор смет конкурентов** (проверка на завышение)
- ✅ **Handwriting OCR** (рукопись → текст)
- ✅ **Башкирский прайс-лист** (локальные цены)

### Phase 3 — Бизнес-модули
- ✅ Telegram-бот (уведомления, фотоотчёты)
- ✅ Панель руководителя (прибыль, загрузка, прогноз)
- ✅ Улучшенный CRM (лиды, воронка, задачи)

### Phase 4 — Упаковка
- ✅ Tauri или улучшенный Electron
- ✅ Инсталлятор
- ✅ Автообновления

## Схема данных (новые таблицы)

### supabase_competitor_estimates
- id, project_id, source_file, items (JSONB), analysis (JSONB), created_at

### supabase_telegram_chats
- id, chat_id, project_id, enabled, notifications_config

### supabase_handwriting_results
- id, photo_url, recognized_text, confidence, created_at

### supabase_local_prices (Башкортостан)
- id, category, name, unit, price, region, updated_at

## Новые AI-агенты

1. **EstimateComparator** — загружает смету конкурента, сравнивает с рыночными ценами, находит завышения
2. **HandwritingOCR** — использует Gemini Vision для распознавания рукописного текста
3. **PriceLocalizer** — адаптирует цены под регион Башкортостан
4. **TelegramNotifier** — формирует и отправляет уведомления

## Дизайн UI

- Не меняем структуру навигации
- Добавляем Shadcn компоненты (button, card, dialog, table, badge)
- Обновляем цветовую схему: строительный бренд (кирпичный/оранжевый)
- Добавляем анимации переходов (framer-motion)
- Улучшаем мобильную версию
