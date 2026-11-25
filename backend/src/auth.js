const crypto = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const { z } = require('zod');
const { formLimiter, validate } = require('./middleware');

const scrypt = promisify(crypto.scrypt);
const ttl = 7 * 24 * 60 * 60 * 1000;
const credentials = z.object({
  username: z.string().trim().min(3, 'Username minimal 3 karakter.').max(50, 'Username maksimal 50 karakter.'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(1024, 'Kata sandi maksimal 1024 karakter.'),
});

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function tokenFrom(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)warban_session=([a-f0-9]{64})(?:;|$)/);
  return match && match[1];
}

function sessionHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function auth(db, config) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.env === 'production', path: '/' };

  function requireLogin(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const token = tokenFrom(req);
    const user = token && db.prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(sessionHash(token), Date.now());
    if (!user) return req.originalUrl.startsWith('/api/') ? res.status(401).json({ error: 'unauthorized', message: 'Silakan masuk terlebih dahulu.' }) : res.redirect('/login.html');
    req.user = user;
    next();
  }

  router.post('/register', formLimiter(5, 15, config.env === 'development'), validate(credentials), async (req, res, next) => {
    try {
      const { username, password } = req.valid;
      const hash = await hashPassword(password);
      db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
      res.status(201).json({ message: 'Akun berhasil dibuat. Silakan masuk.' });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'username_taken', message: 'Username sudah digunakan. Pilih username lain.' });
      }
      next(err);
    }
  });

  router.post('/login', formLimiter(5, 15, config.env === 'development'), validate(credentials), async (req, res, next) => {
    try {
      const { username, password } = req.valid;
      const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
      // Jalankan verifikasi juga saat nama pengguna tidak ditemukan agar respons seragam.
      const valid = await verifyPassword(password, user ? user.password_hash : await hashPassword('invalid-password'));
      if (!user || !valid) return res.status(401).json({ error: 'invalid_credentials', message: 'Username atau kata sandi salah.' });
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sessionHash(token), user.id, Date.now() + ttl);
      res.cookie('warban_session', token, { ...cookieOptions, maxAge: ttl });
      res.json({ username: user.username });
    } catch (err) { next(err); }
  });

  router.post('/logout', requireLogin, (req, res) => {
    const token = tokenFrom(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sessionHash(token));
    res.clearCookie('warban_session', cookieOptions);
    res.json({ ok: true });
  });
  router.get('/me', requireLogin, (req, res) => res.json(req.user));
  return { router, requireLogin };
}

module.exports = { auth, hashPassword, verifyPassword };
