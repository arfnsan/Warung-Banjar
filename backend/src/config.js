const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(__dirname, '..', 'data', 'warban.db'),
  adminKey: process.env.ADMIN_API_KEY || '',
  corsOrigins: list(process.env.CORS_ORIGINS),
  whatsapp: (process.env.WHATSAPP_NUMBER || '628085410098').replace(/\D/g, ''),
  staticDir: process.env.STATIC_DIR
    ? path.resolve(process.cwd(), process.env.STATIC_DIR)
    : path.join(__dirname, '..', '..'),
};
