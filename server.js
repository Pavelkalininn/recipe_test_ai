const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB
  fileFilter: function(req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb('Error: Только изображения!');
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  next();
};

// Initialize database tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        ingredients TEXT NOT NULL,
        instructions TEXT NOT NULL,
        image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(recipe_id, user_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    console.log('База данных инициализирована');
  } catch (err) {
    console.error('Ошибка инициализации БД:', err);
  }
}

initDB();

// Routes

// Registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );

    req.session.userId = result.rows[0].id;
    req.session.username = result.rows[0].username;

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'Пользователь уже существует' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check auth status
app.get('/api/auth/check', (req, res) => {
  if (req.session.userId) {
    res.json({ 
      authenticated: true, 
      user: { id: req.session.userId, username: req.session.username } 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Get all recipes (feed)
app.get('/api/recipes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.username, 
             COALESCE(AVG(rt.rating), 0) as avg_rating,
             COUNT(rt.id) as rating_count
      FROM recipes r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN ratings rt ON r.id = rt.recipe_id
      GROUP BY r.id, u.username
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get single recipe
app.get('/api/recipes/:id', async (req, res) => {
  try {
    const recipeResult = await pool.query(`
      SELECT r.*, u.username,
             COALESCE(AVG(rt.rating), 0) as avg_rating,
             COUNT(rt.id) as rating_count
      FROM recipes r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN ratings rt ON r.id = rt.recipe_id
      WHERE r.id = $1
      GROUP BY r.id, u.username
    `, [req.params.id]);

    if (recipeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Рецепт не найден' });
    }

    const ratingsResult = await pool.query(`
      SELECT rt.*, u.username
      FROM ratings rt
      JOIN users u ON rt.user_id = u.id
      WHERE rt.recipe_id = $1
      ORDER BY rt.created_at DESC
    `, [req.params.id]);

    res.json({
      recipe: recipeResult.rows[0],
      ratings: ratingsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Create recipe
app.post('/api/recipes', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const { title, description, ingredients, instructions } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!title || !ingredients || !instructions) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }

    const result = await pool.query(
      `INSERT INTO recipes (user_id, title, description, ingredients, instructions, image_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.session.userId, title, description, ingredients, instructions, imageUrl]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Add rating/comment
app.post('/api/recipes/:id/rate', requireAuth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const recipeId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
    }

    const result = await pool.query(
      `INSERT INTO ratings (recipe_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (recipe_id, user_id) 
       DO UPDATE SET rating = $3, comment = $4, created_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [recipeId, req.session.userId, rating, comment]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve main page - ВАЖНО: этот роут должен быть последним!
app.get('*', (req, res) => {
  // Не перехватываем API запросы
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint не найден' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
