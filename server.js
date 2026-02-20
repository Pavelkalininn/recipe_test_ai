const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Database ────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://chat_user:chat_pass@localhost:5432/chatapp',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_color VARCHAR(7) DEFAULT '#6C5CE7',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        username VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
    `);
    console.log('✅ Database tables ready');
  } finally {
    client.release();
  }
}

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
}));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Слишком много попыток. Подождите 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const messageLimiter = rateLimit({
  windowMs: 1000,
  max: 5,
  message: { error: 'Слишком быстро! Подождите.' },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use(express.json({ limit: '1kb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Session ─────────────────────────────────────────────────────────────────
const sessionMiddleware = session({
  store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'super-secret-chat-key-change-in-production-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// ─── Static Files with correct MIME types ────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    } else if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
  },
}));

// ─── Auth Routes ─────────────────────────────────────────────────────────────
function sanitize(str) {
  return String(str).replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

const AVATAR_COLORS = [
  '#6C5CE7', '#00B894', '#E17055', '#0984E3', '#D63031',
  '#E84393', '#00CEC9', '#FDCB6E', '#A29BFE', '#55EFC4',
];

app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 2 || cleanUsername.length > 30) {
      return res.status(400).json({ error: 'Логин: от 2 до 30 символов' });
    }
    if (!/^[a-zA-Zа-яА-ЯёЁ0-9_-]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Логин: буквы, цифры, _ и -' });
    }
    if (password.length < 4 || password.length > 100) {
      return res.status(400).json({ error: 'Пароль: от 4 до 100 символов' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Этот логин уже занят' });
    }

    const hash = await bcrypt.hash(password, 12);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, avatar_color) VALUES ($1, $2, $3) RETURNING id, username, avatar_color',
      [cleanUsername, hash, color]
    );

    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.avatarColor = user.avatar_color;

    res.json({ success: true, user: { id: user.id, username: user.username, avatarColor: user.avatar_color } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.avatarColor = user.avatar_color;

    res.json({ success: true, user: { id: user.id, username: user.username, avatarColor: user.avatar_color } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({
      authenticated: true,
      user: { id: req.session.userId, username: req.session.username, avatarColor: req.session.avatarColor },
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ─── Messages History ────────────────────────────────────────────────────────
app.get('/api/messages', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  pool.query(
    `SELECT m.id, m.username, m.content, m.created_at, u.avatar_color
     FROM messages m LEFT JOIN users u ON m.user_id = u.id
     ORDER BY m.created_at DESC LIMIT 100`,
  ).then(result => {
    res.json(result.rows.reverse());
  }).catch(err => {
    console.error('Messages fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const onlineUsers = new Map();

io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session || !session.userId) {
    socket.disconnect(true);
    return;
  }

  const userId = session.userId;
  const username = session.username;
  const avatarColor = session.avatarColor;

  onlineUsers.set(userId, { username, avatarColor, socketId: socket.id });
  io.emit('users:online', Array.from(onlineUsers.values()));

  console.log(`🟢 ${username} connected (${onlineUsers.size} online)`);

  socket.on('message:send', async (data) => {
    if (!data || !data.content) return;

    const content = sanitize(String(data.content).trim());
    if (content.length === 0 || content.length > 2000) return;

    try {
      const result = await pool.query(
        'INSERT INTO messages (user_id, username, content) VALUES ($1, $2, $3) RETURNING id, created_at',
        [userId, username, content]
      );

      const msg = {
        id: result.rows[0].id,
        username,
        content,
        avatar_color: avatarColor,
        created_at: result.rows[0].created_at,
      };

      io.emit('message:new', msg);
    } catch (err) {
      console.error('Message save error:', err);
    }
  });

  socket.on('typing:start', () => {
    socket.broadcast.emit('typing:update', { username, typing: true });
  });

  socket.on('typing:stop', () => {
    socket.broadcast.emit('typing:update', { username, typing: false });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.emit('users:online', Array.from(onlineUsers.values()));
    socket.broadcast.emit('typing:update', { username, typing: false });
    console.log(`🔴 ${username} disconnected (${onlineUsers.size} online)`);
  });
});

// ─── SPA Fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Chat server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});
