# 💬 Messenger — Мессенджер для кентов

Реальный мессенджер с сообщениями в реальном времени. Работает через **localhost.run** — кенты подключаются отовсюду, без проброса портов.

## Фичи

- ✅ Регистрация и вход
- ✅ Личные сообщения (real-time)
- ✅ Групповые чаты
- ✅ Онлайн-статусы
- ✅ «Печатает...»
- ✅ Статусы: ✓ отправлено, ✓✓ доставлено, ✓✓ прочитано
- ✅ Эмодзи-пикер
- ✅ Тёмная тема (Telegram-style)
- ✅ Адаптивность (мобильные)

## Быстрый старт

### 1. Бэкенд

```bash
cd server
npm install
npm run dev
```

Сервер запустится на **порту 3001**.

### 2. Фронтенд

```bash
cd client
npm install
npm run dev
```

Фронт запустится на **порту 5173**.

### 3. Туннель для кентов

Открой **третий терминал**:

```bash
ssh -R 80:localhost:5173 nokey@localhost.run
```

Получишь ссылку типа: `https://xxxxx.localhost.run`

**Кидаешь ссылку кентам — они открывают и общаются!**

## Структура

```
messenger/
├── server/
│   ├── src/
│   │   └── server.js    — Express + Socket.IO + SQLite
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx       — Главный компонент
│   │   ├── App.css       — Стили (Telegram Dark)
│   │   ├── store/
│   │   │   └── useStore.js  — Zustand + Socket.IO
│   │   └── components/
│   │       ├── Login.jsx
│   │       ├── Sidebar.jsx
│   │       └── ChatWindow.jsx
│   └── package.json
└── README.md
```

## Как это работает

```
Кент 1:  телефон → ссылка .localhost.run ─┐
                                            ↓
Ты:      localhost:5173 ←→ localhost:3001 ← SSH туннель
                                            ↑
Кент 2:  ноут → ссылка .localhost.run  ────┘
```

## Важные моменты

- ⚠️ **Комп должен быть включён** пока идёт общение
- ⚠️ Ссылка меняется при каждом перезапуске туннеля
- ⚠️ Если комп уходит в сон — связь обрывается
- ✅ **Бесплатно**, без регистрации, без проброса портов

## Технологии

- **Backend:** Node.js, Express, Socket.IO, better-sqlite3, JWT, bcrypt
- **Frontend:** React, Vite, Zustand, Socket.IO Client
- **Туннель:** localhost.run (SSH, без установки программ)

## Хочешь чтобы работало 24/7 без включённого компа?

Задеплой бэкенд на **Railway** (бесплатно):
1. Залей репо на GitHub
2. Подключи к Railway
3. Добавь PostgreSQL
4. В `.env` укажи `DATABASE_URL` и `JWT_SECRET`
5. Фронтенд на **Vercel/Netlify** — укажи `VITE_API_URL` на Railway

---

Сделано с ❤️ для общения с кентами
