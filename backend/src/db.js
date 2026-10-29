const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  image TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  short_desc TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  old_price INTEGER CHECK (old_price IS NULL OR old_price >= 0),
  image TEXT,
  rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  calories INTEGER,
  prep_minutes INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  badge TEXT,
  badge_style TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_items(category_id);

CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  max_discount INTEGER,
  min_order INTEGER NOT NULL DEFAULT 0,
  is_daily INTEGER NOT NULL DEFAULT 0,   -- 1 = berakhir tiap hari pukul 23:59:59 WITA
  starts_at TEXT,                         -- ISO UTC, null = langsung aktif
  ends_at TEXT,                           -- ISO UTC, null = tanpa batas (abaikan jika is_daily)
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_featured INTEGER NOT NULL DEFAULT 0, -- dipakai untuk banner/countdown di beranda
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('delivery','pickup')),
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'cod',
  promo_code TEXT,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  date TEXT NOT NULL,     -- YYYY-MM-DD (WITA)
  time TEXT NOT NULL,     -- HH:MM (WITA)
  guests INTEGER NOT NULL CHECK (guests > 0),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_resv_date ON reservations(date, status);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  is_approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS search_logs (
  term TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 1,
  last_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

const DEFAULT_SETTINGS = {
  open_time: '09:00',
  close_time: '22:00',        // sesuai HTML: 09.00 - 22.00
  reservation_last_seating_before_close: '60', // menit; reservasi terakhir = tutup - 60 menit
  reservation_capacity: '40', // total kursi per jendela waktu
  reservation_stay_minutes: '90',
  reservation_max_days_ahead: '60',
  reservation_max_guests: '30',
  delivery_fee: '0',          // "Gratis Antar"
  free_delivery_min: '0',
  min_order: '0',
};

function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  const num = (k) => Number(s[k]);
  return {
    open_time: s.open_time,
    close_time: s.close_time,
    reservation_last_seating_before_close: num('reservation_last_seating_before_close'),
    reservation_capacity: num('reservation_capacity'),
    reservation_stay_minutes: num('reservation_stay_minutes'),
    reservation_max_days_ahead: num('reservation_max_days_ahead'),
    reservation_max_guests: num('reservation_max_guests'),
    delivery_fee: num('delivery_fee'),
    free_delivery_min: num('free_delivery_min'),
    min_order: num('min_order'),
  };
}

module.exports = { openDb, getSettings, DEFAULT_SETTINGS };
