# Continue IDE + OpenRouter Setup

## 📋 Что включено

### Primary Models (основные агенты):
1. **Mistral Small** - быстрый, хороший для кодирования (32K context)
2. **Qwen 2 7B** - отличный баланс скорость/качество  
3. **Neural Chat 7B** - специализирован для код-ассистанса
4. **OpenChat 3.5** - умный и быстрый
5. **Claude 3.5 Sonnet** - премиум-класс на OpenRouter
6. **GPT-4 Turbo** - мощный лучший для сложных задач

### Autocomplete Model:
- **Mistral Small** - для автодополнения кода в реальном времени

### Embeddings & Reranker:
- **OpenAI Text Embedding 3 Small** - качественные эмбеддинги
- **MXBai Rerank** - лучшая переранжировка результатов

---

## 🔑 Как получить OpenRouter API ключ

### Шаг 1: Регистрация на OpenRouter
```
https://openrouter.ai/
```
- Нажимаем "Sign in with Google" или "Sign up"
- Подтверждаем email

### Шаг 2: Создание API ключа
1. Идем в **Keys** (https://openrouter.ai/keys)
2. Нажимаем **"Create New Key"**
3. Копируем ключ (выглядит как: `sk-or-v1-...`)

### Шаг 3: Установка в системе

#### Вариант A: Глобальная переменная окружения (рекомендуется)

**Windows (PowerShell):**
```powershell
$env:OPENROUTER_API_KEY = "sk-or-v1-YOUR_KEY_HERE"
[System.Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", "sk-or-v1-YOUR_KEY_HERE", "User")
```

**Windows (CMD):**
```cmd
setx OPENROUTER_API_KEY "sk-or-v1-YOUR_KEY_HERE"
```

Затем **перезагрузите VS Code** или компьютер!

#### Вариант B: .env файл в проекте
Создайте файл `.env` в корне проекта:
```
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
```

---

## 🚀 Использование в VS Code

### Continue Chat (Ctrl+L)
- Откроет панель Chat с выбранной моделью
- Используйте для вопросов и анализа

### Slash Commands:
- `/edit` - редактировать код  
- `/sh` - выполнить команду
- `/debug` - отладка
- `/codebase` - поиск по базе кода

### Autocomplete (Tab)
- Включится автоматически при вводе
- Использует Mistral Small для быстроты

---

## 💡 Рекомендации по использованию

| Задача | Модель | Причина |
|--------|--------|---------|
| Быстрые вопросы | Mistral Small | Самая быстрая |
| Кодирование | Qwen 2 7B | Отличен для Python/JS |
| Сложный анализ | Claude 3.5 Sonnet | Лучшее качество |
| Production code | GPT-4 Turbo | Надежность |
| Автодополнение | Mistral Small | Real-time скорость |

---

## ✔️ Проверка конфигурации

1. **Откройте в VS Code**: `Ctrl+Shift+P` → `Continue: Run a slash command`
2. **Выберите модель**: Должны отобразиться все 6 моделей
3. **Тест**: Напишите в chat - должна подключиться!

---

## 🔧 Файл конфига

Расположение: `C:\Users\User\.continue\config.json`

Если нужны изменения - отредактируйте JSON и перезагрузите VS Code.

---

## ⚙️ Для проекта SmetaAI

Обновите `.env`:
```env
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
OPENAI_API_KEY=sk-...  # Если используете OpenAI напрямую

# Или измените config.py для использования OpenRouter
```

Готово! Теперь у вас есть **6 мощных бесплатных/платных агентов** прямо в VS Code! 🎉
