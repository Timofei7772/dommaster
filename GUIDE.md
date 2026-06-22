# 📘 ZARU Смета — Полное руководство пользователя

> **Версия:** 1.0.0  
> **Дата:** Январь 2026  
> **Разработчик:** ZARU

---

## 📋 Содержание

1. [Введение](#введение)
2. [Способы запуска](#способы-запуска)
3. [Функционал программы](#функционал-программы)
4. [Настройка AI-функций](#настройка-ai-функций)
5. [Система лицензирования](#система-лицензирования)
6. [Безопасность](#безопасность)
7. [Для разработчиков](#для-разработчиков)
8. [Монетизация и продажа](#монетизация-и-продажа)
9. [Часто задаваемые вопросы](#faq)

---

## 🎯 Введение

**ZARU Смета** — профессиональная программа для составления строительных смет с AI-помощником. Поддерживает:
- Создание смет на ремонтно-строительные работы
- Договоры подряда (физлица, юрлица, ИП)
- Формы КС-2, КС-3, М-29
- AI-сканер чертежей и фото
- Экспорт в PDF и Excel

---

## 🚀 Способы запуска

### 1. Десктоп версия (Windows)

**Установка:**
1. Скачайте установщик \ZARU Смета Setup 1.0.0.exe\
2. Запустите и следуйте инструкциям
3. Программа установится в \C:\Program Files\smeta-ai-desktop\
4. Ярлык появится на рабочем столе

**Запуск:**
- Дважды кликните на ярлык "ZARU Смета"
- Или найдите в меню Пуск

---

### 2. Веб-версия (браузер)

**Для разработки:**
\\\ash
# 1. Запустите backend
cd C:\Projects\SmetaAI\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# 2. Запустите frontend (в другом терминале)
cd C:\Projects\SmetaAI\frontend
npm run dev
\\\

Откройте в браузере: http://localhost:3001

**Для продакшена:**
\\\ash
# Сборка frontend
cd C:\Projects\SmetaAI\frontend
npm run build

# Файлы будут в папке dist/
\\\

---

### 3. Мобильная версия (PWA)

**Установка на телефон:**
1. Откройте http://ваш-домен.ru в браузере Chrome/Safari
2. Нажмите "Добавить на главный экран"
3. Приложение установится как обычное

**Особенности PWA:**
- Работает офлайн (кеширует данные)
- Иконка на рабочем столе
- Полноэкранный режим
- Push-уведомления

---

### 4. Публикация в интернете

**Вариант 1: VPS сервер (рекомендуется)**
\\\ash
# На сервере Ubuntu/Debian

# 1. Установите зависимости
sudo apt update
sudo apt install python3.11 python3.11-venv nodejs npm nginx

# 2. Клонируйте проект
git clone https://github.com/your-repo/SmetaAI.git
cd SmetaAI

# 3. Настройте backend
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Запустите через systemd
sudo nano /etc/systemd/system/smeta-backend.service
\\\

Содержимое smeta-backend.service:
\\\ini
[Unit]
Description=ZARU Smeta Backend
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/SmetaAI/backend
ExecStart=/var/www/SmetaAI/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
\\\

\\\ash
# 5. Соберите frontend
cd ../frontend
npm install
npm run build

# 6. Настройте Nginx
sudo nano /etc/nginx/sites-available/smeta
\\\

Содержимое nginx конфига:
\\\
ginx
server {
    listen 80;
    server_name ваш-домен.ru;
    
    # Frontend
    location / {
        root /var/www/SmetaAI/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
\\\

\\\ash
# 7. Активируйте и запустите
sudo ln -s /etc/nginx/sites-available/smeta /etc/nginx/sites-enabled/
sudo systemctl restart nginx
sudo systemctl start smeta-backend
sudo systemctl enable smeta-backend
\\\

**Вариант 2: Vercel + Railway (бесплатно для старта)**
- Frontend на Vercel: https://vercel.com
- Backend на Railway: https://railway.app

---

## ⚙️ Функционал программы

### Сметы
- ✅ Создание новых смет
- ✅ Добавление работ вручную
- ✅ AI-сканер чертежей
- ✅ Расчёт накладных, прибыли, НДС
- ✅ Экспорт в PDF/Excel

### Договоры
- ✅ 3 типа заказчиков (физлица, юрлица, ИП)
- ✅ Дополнительные соглашения
- ✅ Печать договоров

### Формы
- ✅ КС-2 (акты выполненных работ)
- ✅ КС-3 (справка о стоимости)
- ✅ М-29 (списание материалов)

### Справочники
- ✅ База работ с расценками
- ✅ База материалов
- ✅ Региональные коэффициенты

---

## 🤖 Настройка AI-функций

### Получение API ключа Gemini:

1. Перейдите на https://makersuite.google.com/app/apikey
2. Войдите в Google аккаунт
3. Нажмите "Create API Key"
4. Скопируйте ключ (начинается с AIza...)

### Добавление ключа в программу:

1. Откройте **Настройки** → **Интеграции**
2. Вставьте ключ в поле "Gemini API Key"
3. Нажмите **Сохранить всё**
4. Ключ сохранится и зашифруется

### Почему ключи не сохранялись раньше?
Старая версия не использовала localStorage. Теперь исправлено:
- Ключи шифруются Base64 перед сохранением
- Хранятся в localStorage браузера
- Автоматически загружаются при запуске

---

## 🔐 Система лицензирования

### Тарифные планы:

| План | Цена | Лимит смет | Функции |
|------|------|------------|---------|
| **Пробный** | Бесплатно (14 дней) | 10 | PDF экспорт |
| **Базовый** | 2 990 ₽/год | 100 | + Excel, Договоры |
| **Профессионал** | 7 990 ₽/год | 1000 | + AI, КС-2/3, М-29 |
| **Корпоративный** | 24 990 ₽/год | ∞ | + API, Приоритет |

### Активация лицензии:

1. Откройте **Настройки** → **Лицензия**
2. Введите ключ формата: \ZARU-XXXX-XXXX-XXXX-PROF\
3. Нажмите **Активировать**

### Генерация лицензионных ключей (для продавца):

Ключи формируются по схеме:
\\\
ZARU-[4 символа]-[4 символа]-[4 символа]-[ТИП]
ТИП: TRIA (пробный), BASI (базовый), PROF (про), ENTE (корпоративный)
\\\

Пример ключей:
- \ZARU-A1B2-C3D4-E5F6-BASI\ — Базовый на год
- \ZARU-X9Y8-Z7W6-V5U4-PROF\ — Профессионал на год
- \ZARU-M1N2-O3P4-Q5R6-ENTE\ — Корпоративный

---

## 🛡️ Безопасность

### Защита данных:

1. **API ключи** — шифруются Base64 в localStorage
2. **Пароли** — не хранятся (OAuth авторизация)
3. **База данных** — SQLite с опциональным шифрованием

### Рекомендации:

- ✅ Используйте HTTPS на продакшене
- ✅ Регулярно делайте бэкапы
- ✅ Не делитесь API ключами
- ✅ Обновляйте зависимости

### Защита от взлома (для продакшена):

\\\ash
# 1. SSL сертификат (бесплатный)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен.ru

# 2. Firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# 3. Fail2ban (защита от брутфорса)
sudo apt install fail2ban
sudo systemctl enable fail2ban
\\\

---

## 👨‍💻 Для разработчиков

### Структура проекта:
\\\
SmetaAI/
├── backend/           # Python FastAPI
│   ├── app/
│   │   ├── main.py    # Точка входа
│   │   ├── models/    # SQLAlchemy модели
│   │   ├── routers/   # API эндпоинты
│   │   └── services/  # Бизнес-логика
│   └── requirements.txt
│
├── frontend/          # React + TypeScript
│   ├── src/
│   │   ├── components/  # UI компоненты
│   │   ├── pages/       # Страницы
│   │   ├── store/       # Zustand сторы
│   │   └── hooks/       # Кастомные хуки
│   └── package.json
│
└── desktop/           # Electron
    ├── main.js        # Главный процесс
    └── package.json
\\\

### Как редактировать и деплоить:

**1. Редактирование:**
\\\ash
# Откройте VS Code
code C:\Projects\SmetaAI

# Измените файлы в frontend/src или backend/app
# Сохраните — hot-reload обновит приложение
\\\

**2. Тестирование:**
\\\ash
# Запустите frontend в dev режиме
cd frontend && npm run dev

# Запустите backend
cd backend && uvicorn app.main:app --reload
\\\

**3. Сборка для продакшена:**
\\\ash
# Frontend
cd frontend
npm run build

# Desktop (Windows installer)
cd desktop
npm run build:win
\\\

**4. Деплой обновления:**
\\\ash
# На сервере
cd /var/www/SmetaAI
git pull
cd frontend && npm run build
sudo systemctl restart smeta-backend
\\\

---

## 💰 Монетизация и продажа

### Способы монетизации:

1. **Подписка (SaaS)** — ежемесячная/годовая оплата
2. **Лицензии** — разовая покупка на срок
3. **Freemium** — базовый функционал бесплатно, расширенный платно

### Как продавать лицензии:

**1. Создайте лендинг** (Tilda, Wix, самописный)

**2. Подключите оплату:**
- ЮKassa (юрлица РФ)
- Robokassa
- Stripe (международный)

**3. Автоматизация выдачи ключей:**
\\\python
# backend/app/routers/license.py
import secrets
from fastapi import APIRouter

router = APIRouter()

@router.post("/generate-license")
def generate_license(plan: str):
    types = {"basic": "BASI", "pro": "PROF", "enterprise": "ENTE"}
    code = types.get(plan, "TRIA")
    key = f"ZARU-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{code}"
    return {"license_key": key}
\\\

**4. Webhook от платёжки → генерация ключа → отправка на email**

### Защита от пиратства:

1. **Онлайн-проверка** — ключ проверяется на сервере
2. **Привязка к железу** — HWID компьютера
3. **Обфускация кода** — затрудняет реверс-инжиниринг

---

## ❓ FAQ

**Q: Программа не запускается?**
A: Проверьте, что порт 8000 свободен. Запустите от администратора.

**Q: AI сканер не работает?**
A: Проверьте API ключ в Настройки → Интеграции. Убедитесь, что ключ активен.

**Q: Как перенести на другой компьютер?**
A: Экспортируйте настройки (Настройки → Бэкап) и базу данных (backend/smeta_ai.db).

**Q: Можно ли работать офлайн?**
A: Да, PWA кеширует приложение. AI-функции требуют интернет.

**Q: Как обновить программу?**
A: Desktop: скачайте новый установщик. Web: git pull + npm run build.

---

## 📞 Поддержка

- **Email:** support@zaru-smeta.ru
- **Telegram:** @zaru_smeta_support
- **Документация:** https://docs.zaru-smeta.ru

---

© 2026 ZARU Смета. Все права защищены.
