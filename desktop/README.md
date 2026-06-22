# Смета AI — Desktop версия

Десктопное приложение на базе Electron для Windows.

## Сборка

### Подготовка

1. Сначала соберите frontend:
```bash
cd ../frontend
npm run build
```

2. Установите зависимости desktop:
```bash
cd ../desktop
npm install
```

### Режим разработки

Запустите frontend dev-сервер и затем Electron:

```bash
# Терминал 1 - frontend
cd ../frontend
npm run dev

# Терминал 2 - electron
cd ../desktop
npm start
```

### Сборка дистрибутива

```bash
npm run build:win
```

Готовый установщик появится в папке `dist/`.

## Иконка приложения

Поместите файл `icon.ico` (256x256) в папку `assets/`.

## Структура

```
desktop/
├── main.js        # Главный процесс Electron
├── preload.js     # Preload скрипт для безопасности
├── package.json   # Конфигурация и сборка
├── assets/        # Иконки и ресурсы
│   └── icon.ico
└── dist/          # Собранные установщики
```
