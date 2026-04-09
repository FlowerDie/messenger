import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'messenger-secret-change-in-production';

// ===================== MIDDLEWARE =====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Логирование всех запросов
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Socket.IO
const io = new Server(server, {
  cors: { origin: '*' },
});

// ===================== БАЗА ДАННЫХ =====================
const dbPath = join(__dirname, '../data/messenger.db');
const dataDir = join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    status TEXT DEFAULT 'offline',
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT NULL');
} catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
    name TEXT DEFAULT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (chat_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id),
    text TEXT NOT NULL DEFAULT '',
    status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
`);

// ===================== TRACKING ONLINE =====================
const onlineUsers = new Map();

// ===================== AUTH =====================
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Заполни все поля' });
    }
    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Мин 3 символа логин, мин 4 пароль' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Юзернейм занят' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
    ).run(username, hash, displayName);

    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, userId: result.lastInsertRowid, username, displayName, avatar: null });
  } catch (e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, userId: user.id, username: user.username, displayName: user.display_name, avatar: user.avatar || null });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===================== AUTH MIDDLEWARE =====================
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Нет токена' });

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Невалидный токен' });
  }
};

// ===================== API: Avatar =====================
app.post('/api/users/avatar', authMiddleware, (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: 'Нет аватарки' });
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.userId);
    res.json({ ok: true, avatar });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== API: Users =====================
app.get('/api/users/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, display_name, avatar, status, last_seen FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/search', authMiddleware, (req, res) => {
  try {
    const q = req.query.q || '';
    const users = db.prepare(
      `SELECT id, username, display_name, avatar, status FROM users
       WHERE username LIKE ? AND id != ?
       LIMIT 20`
    ).all(`%${q}%`, req.userId);
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/:id', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, display_name, avatar, status, last_seen FROM users WHERE id = ?').get(req.params.id);
    res.json(user || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== API: Chats =====================
app.get('/api/chats', authMiddleware, (req, res) => {
  try {
    const chats = db.prepare(`
      SELECT c.*,
        (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
      FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = ?
      ORDER BY last_message_time DESC
    `).all(req.userId);

    const result = chats.map(chat => {
      if (chat.type === 'direct') {
        const mate = db.prepare(`
          SELECT u.id, u.username, u.display_name, u.avatar, u.status, u.last_seen
          FROM users u
          JOIN chat_members cm ON cm.user_id = u.id
          WHERE cm.chat_id = ? AND u.id != ?
          LIMIT 1
        `).get(chat.id, req.userId);
        return { ...chat, mate };
      }
      return chat;
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chats', authMiddleware, (req, res) => {
  try {
    const { type, name, memberIds } = req.body;
    if (!type || !memberIds || memberIds.length === 0) {
      return res.status(400).json({ error: 'Заполни type и memberIds' });
    }

    if (type === 'direct' && memberIds.length === 1) {
      const existing = db.prepare(`
        SELECT cm1.chat_id FROM chat_members cm1
        JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
        WHERE cm1.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)
          AND cm2.user_id = ?
          AND (SELECT COUNT(*) FROM chat_members WHERE chat_id = cm1.chat_id) = 2
      `).get(req.userId, memberIds[0]);

      if (existing) {
        return res.json({ chatId: existing.chat_id, created: false });
      }
    }

    const chatName = type === 'group' ? name : null;
    const result = db.prepare('INSERT INTO chats (type, name, created_by) VALUES (?, ?, ?)').run(
      type, chatName, req.userId
    );
    const chatId = result.lastInsertRowid;

    db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chatId, req.userId);
    for (const memberId of memberIds) {
      db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chatId, memberId);
    }

    res.json({ chatId, created: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chats/:id/messages', authMiddleware, (req, res) => {
  try {
    const messages = db.prepare(`
      SELECT m.*, u.username, u.display_name, u.avatar
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ?
      ORDER BY m.created_at DESC
      LIMIT 100
    `).all(req.params.id).reverse();

    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/messages', authMiddleware, (req, res) => {
  try {
    const { chatId, text } = req.body;
    if (!chatId || !text?.trim()) {
      return res.status(400).json({ error: 'Нет chatId или text' });
    }
    const result = db.prepare(
      'INSERT INTO messages (chat_id, sender_id, text, status) VALUES (?, ?, ?, ?)'
    ).run(chatId, req.userId, text.trim(), 'delivered');

    const message = db.prepare(`
      SELECT m.*, u.username, u.display_name, u.avatar
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);

    // Отправляем через сокет если подключён
    io.to(`chat-${chatId}`).emit('new-message', message);

    res.json({ ok: true, message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/messages/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM messages WHERE id = ? AND sender_id = ?').run(req.params.id, req.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== SOCKET.IO =====================
io.on('connection', (socket) => {
  console.log('🔌 Socket подключился:', socket.id);

  socket.on('auth', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      onlineUsers.set(decoded.userId, socket.id);

      db.prepare("UPDATE users SET status = 'online', last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(decoded.userId);

      const chats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(decoded.userId);
      for (const chat of chats) {
        const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').all(chat.chat_id, decoded.userId);
        for (const member of members) {
          if (onlineUsers.has(member.user_id)) {
            io.to(onlineUsers.get(member.user_id)).emit('user-status', {
              userId: decoded.userId,
              status: 'online',
            });
          }
        }
      }

      socket.emit('auth-success', { userId: decoded.userId });
    } catch {
      socket.emit('auth-error', { error: 'Невалидный токен' });
    }
  });

  socket.on('join-chat', (chatId) => {
    socket.join(`chat-${chatId}`);
    if (socket.userId) {
      db.prepare("UPDATE messages SET status = 'read' WHERE chat_id = ? AND sender_id != ?").run(chatId, socket.userId);
    }
  });

  socket.on('send-message', ({ chatId, text }) => {
    if (!socket.userId || !text.trim()) return;

    const result = db.prepare(
      'INSERT INTO messages (chat_id, sender_id, text, status) VALUES (?, ?, ?, ?)'
    ).run(chatId, socket.userId, text.trim(), 'delivered');

    const message = db.prepare(`
      SELECT m.*, u.username, u.display_name, u.avatar
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);

    io.to(`chat-${chatId}`).emit('new-message', message);
  });

  socket.on('typing', ({ chatId }) => {
    socket.to(`chat-${chatId}`).emit('user-typing', { userId: socket.userId, chatId });
  });

  socket.on('stop-typing', ({ chatId }) => {
    socket.to(`chat-${chatId}`).emit('user-stop-typing', { userId: socket.userId, chatId });
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      db.prepare("UPDATE users SET status = 'offline', last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(socket.userId);

      const chats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(socket.userId);
      for (const chat of chats) {
        const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').all(chat.chat_id, socket.userId);
        for (const member of members) {
          if (onlineUsers.has(member.user_id)) {
            io.to(onlineUsers.get(member.user_id)).emit('user-status', {
              userId: socket.userId,
              status: 'offline',
            });
          }
        }
      }
    }
    console.log('🔌 Socket отключился:', socket.id);
  });
});

// ===================== СТАТИКА (ФРОНТЕНД) =====================
const clientDist = join(__dirname, '../../client/dist');
const indexHtml = join(clientDist, 'index.html');

app.get('/', (req, res) => {
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.json({ error: 'Frontend not built' });
  }
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Catch-all для SPA
app.get('*', (req, res) => {
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).send('Frontend not built');
  }
});

// ===================== ГЛОБАЛЬНЫЙ ERROR HANDLER =====================
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ===================== ЗАПУСК =====================
server.listen(PORT, () => {
  console.log(`\n🚀 Мессенджер запущен на порту ${PORT}`);
  console.log(`📡 Фронтенд: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/...`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📂 Статика: ${clientDist}`);
  console.log(`✅ index.html: ${fs.existsSync(indexHtml) ? 'OK' : 'NOT FOUND'}\n`);
});
