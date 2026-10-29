const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const { apiLimiter, requireAdmin, notFound, errorHandler } = require('./middleware');
const publicRoutes = require('./routes/public');
const ordersRoutes = require('./routes/orders');
const reservationRoutes = require('./routes/reservations');
const engagementRoutes = require('./routes/engagement');
const adminRoutes = require('./routes/admin');

/**
 * Bangun aplikasi Express. Dipisah dari server.js supaya mudah dites.
 * @param {import('better-sqlite3').Database} db
 * @param {object} config
 */
function createApp(db, config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // di belakang Nginx/Cloudflare/Railway dsb, agar rate-limit membaca IP asli

  // CSP dimatikan karena frontend memakai inline script/style + CDN (Google Fonts, YouTube).
  // Kencangkan nanti kalau semua aset sudah lokal.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  if (config.corsOrigins.length) {
    app.use('/api', cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization'], maxAge: 600 }));
  }
  app.use('/api', express.json({ limit: '50kb' }));
  app.use('/api', apiLimiter);

  app.use('/api', publicRoutes(db));
  app.use('/api/orders', ordersRoutes(db, config));
  app.use('/api/reservations', reservationRoutes(db));
  app.use('/api', engagementRoutes(db));
  app.use('/api/admin', requireAdmin(config.adminKey), adminRoutes(db));
  app.use('/api', notFound);

  // Sajikan frontend statis. Hanya folder/file frontend yang di-whitelist, supaya
  // backend/ (.env, database) TIDAK pernah ikut terekspos.
  const root = config.staticDir;
  if (root && fs.existsSync(path.join(root, 'index.html'))) {
    for (const dir of ['css', 'js', 'img', 'webfonts']) {
      app.use(`/${dir}`, express.static(path.join(root, dir), { maxAge: config.env === 'production' ? '7d' : 0, dotfiles: 'deny' }));
    }
    app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
