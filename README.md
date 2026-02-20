# 💬 Pulse Chat — Real-time Chat Application

Полноценное чат-приложение с авторизацией, real-time сообщениями через WebSocket, PWA-поддержкой и nginx в качестве reverse proxy.

## Стек технологий

- **Backend:** Node.js, Express, Socket.IO
- **Database:** PostgreSQL (пользователи, сообщения, сессии)
- **Auth:** bcryptjs + express-session (хранение сессий в PostgreSQL)
- **Security:** Helmet, express-rate-limit, nginx rate limiting
- **PWA:** Service Worker, Web App Manifest, иконки для всех устройств
- **Frontend:** Vanilla JS SPA, адаптивный дизайн

## Быстрый старт

### Вариант 1: Docker Compose (рекомендуется)

```bash
# Клонируйте проект и перейдите в папку
cd chat-app

# Запустите всё одной командой
docker-compose up --build -d

# Приложение доступно на http://localhost (через nginx)
# Или напрямую на http://localhost:3000
```

### Вариант 2: Ручная установка

```bash
# 1. Убедитесь, что PostgreSQL запущен и создайте БД:
createdb chatapp
# Или в psql:
# CREATE DATABASE chatapp;
# CREATE USER chat_user WITH PASSWORD 'chat_pass';
# GRANT ALL PRIVILEGES ON DATABASE chatapp TO chat_user;

# 2. Установите зависимости
npm install

# 3. Сгенерируйте иконки (нужен пакет canvas)
npm install canvas
node generate-icons.js
npm uninstall canvas  # можно удалить после генерации

# 4. Настройте переменные окружения
cp .env.example .env
# Отредактируйте .env

# 5. Запустите
npm start
```

### Вариант 3: Деплой на Railway.app / Render.com

1. Создайте PostgreSQL add-on
2. Установите переменные: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`
3. Деплойте — иконки сгенерируются при первом билде (потребуется postinstall-скрипт)

## Nginx

Конфигурация `nginx.conf` включает:
- Rate limiting для auth (5 req/min), API (20 req/s), WebSocket, общий (30 req/s)
- Лимит соединений (50 на IP)
- Security headers (X-Frame-Options, X-Content-Type-Options, XSS Protection и др.)
- Gzip-сжатие
- Блокировка подозрительных путей (.php, wp-admin, .env, .git)
- Правильный проксинг WebSocket
- Готовность к SSL (закомментированные секции)

## PWA

- Иконки для всех размеров: 72, 96, 128, 144, 152, 192, 384, 512
- Maskable-иконки для Android (192, 512)
- Apple Touch Icon (180x180)
- Service Worker с кешированием статики
- Standalone-режим, работа оффлайн для закешированных ресурсов

## Структура проекта

```
chat-app/
├── server.js              # Express + Socket.IO сервер
├── package.json
├── generate-icons.js      # Генерация PWA иконок
├── nginx.conf             # Nginx reverse proxy config
├── docker-compose.yml     # Docker Compose (app + postgres + nginx)
├── Dockerfile
├── .env.example
├── .dockerignore
└── public/
    ├── index.html         # SPA — авторизация + чат
    ├── sw.js              # Service Worker
    ├── manifest.webmanifest
    └── icons/             # Генерируются скриптом
```
