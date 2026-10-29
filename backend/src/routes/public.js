const express = require('express');
const { z } = require('zod');
const { getSettings } = require('../db');
const { HttpError, likeEscape, toMinutes, toHHMM } = require('../utils');
const { validate } = require('../middleware');
const { assertPromoUsable, computeDiscount, publicPromo } = require('../promo');

const SORTS = {
  popular: 'm.review_count DESC, m.sort ASC',
  rating: 'm.rating DESC, m.review_count DESC',
  price_asc: 'm.price ASC',
  price_desc: 'm.price DESC',
  default: 'm.sort ASC, m.id ASC',
};

const BASE_SELECT = `
  SELECT m.*, c.slug AS category_slug, c.name AS category_name
  FROM menu_items m JOIN categories c ON c.id = m.category_id`;

function mapItem(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: { slug: r.category_slug, name: r.category_name },
    short_desc: r.short_desc,
    description: r.description,
    price: r.price,
    old_price: r.old_price,
    discount_percent: r.old_price && r.old_price > r.price ? Math.round((1 - r.price / r.old_price) * 100) : 0,
    image: r.image,
    rating: r.rating,
    review_count: r.review_count,
    calories: r.calories,
    prep_minutes: r.prep_minutes,
    tags: JSON.parse(r.tags || '[]'),
    badge: r.badge ? { label: r.badge, style: r.badge_style || '' } : null,
    is_available: !!r.is_available,
  };
}

const menuQuery = z.object({
  category: z.string().trim().max(40).optional(),
  q: z.string().trim().max(60).optional(),
  sort: z.enum(['popular', 'rating', 'price_asc', 'price_desc', 'default']).default('default'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  log: z.enum(['0', '1']).optional(), // 1 = catat kata kunci untuk "Paling banyak dicari"
});

module.exports = (db) => {
  const r = express.Router();

  r.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  /** Info umum warung (jam buka, ongkir, kontak) */
  r.get('/info', (_req, res) => {
    const s = getSettings(db);
    res.json({
      name: 'Warban - Warung Masakan Banjar',
      hours: {
        open: s.open_time, close: s.close_time,
        last_reservation: toHHMM(toMinutes(s.close_time) - s.reservation_last_seating_before_close),
        timezone: 'WITA (UTC+8)',
      },
      delivery_fee: s.delivery_fee,
      free_delivery_min: s.free_delivery_min,
      min_order: s.min_order,
      reservation: { max_guests: s.reservation_max_guests, max_days_ahead: s.reservation_max_days_ahead },
    });
  });

  r.get('/categories', (_req, res) => {
    const rows = db.prepare(`
      SELECT c.slug, c.name, c.image,
        (SELECT COUNT(*) FROM menu_items m WHERE m.category_id = c.id AND m.is_available = 1) AS item_count
      FROM categories c ORDER BY c.sort, c.id`).all();
    const total = rows.reduce((a, c) => a + c.item_count, 0);
    res.json({ total_items: total, categories: rows });
  });

  r.get('/menu', validate(menuQuery, 'query'), (req, res) => {
    const { category, q, sort, limit, log } = req.valid;
    const where = ['m.is_available = 1'];
    const params = [];
    if (category && category !== 'all') {
      where.push('c.slug = ?');
      params.push(category);
    }
    if (q) {
      const like = `%${likeEscape(q.toLowerCase())}%`;
      where.push(`(LOWER(m.name) LIKE ? ESCAPE '\\' OR LOWER(m.description) LIKE ? ESCAPE '\\'
        OR LOWER(m.tags) LIKE ? ESCAPE '\\' OR LOWER(c.name) LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like);
    }
    const rows = db.prepare(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${SORTS[sort]} LIMIT ?`).all(...params, limit);

    if (log === '1' && q && q.length >= 3 && rows.length) {
      db.prepare(`INSERT INTO search_logs (term,hits) VALUES (?,1)
        ON CONFLICT(term) DO UPDATE SET hits = hits + 1, last_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(q.toLowerCase());
    }
    res.json({ count: rows.length, items: rows.map(mapItem) });
  });

  r.get('/menu/:idOrSlug', (req, res) => {
    const key = req.params.idOrSlug;
    const row = /^\d+$/.test(key)
      ? db.prepare(`${BASE_SELECT} WHERE m.id = ?`).get(Number(key))
      : db.prepare(`${BASE_SELECT} WHERE m.slug = ?`).get(key);
    if (!row) throw new HttpError(404, 'Menu tidak ditemukan.', 'not_found');
    res.json(mapItem(row));
  });

  /** Kata kunci terpopuler untuk overlay pencarian */
  r.get('/search/trending', (req, res) => {
    const limit = Math.min(12, Math.max(1, parseInt(req.query.limit, 10) || 6));
    const rows = db.prepare('SELECT term, hits FROM search_logs ORDER BY hits DESC, last_at DESC LIMIT ?').all(limit);
    res.json({ terms: rows });
  });

  /** Promo unggulan untuk banner + countdown beranda */
  r.get('/promo', (_req, res) => {
    const promos = db.prepare('SELECT * FROM promos WHERE is_active = 1 AND is_featured = 1 ORDER BY id DESC').all();
    for (const p of promos) {
      try {
        assertPromoUsable(p, p.min_order);
        return res.json({ active: true, promo: publicPromo(p) });
      } catch { /* coba promo berikutnya */ }
    }
    res.json({ active: false, promo: null });
  });

  /** Cek kode promo untuk subtotal tertentu */
  r.get('/promo/validate', validate(z.object({
    code: z.string().trim().toUpperCase().min(1).max(30),
    subtotal: z.coerce.number().int().min(0).max(100_000_000),
  }), 'query'), (req, res) => {
    const { code, subtotal } = req.valid;
    const p = db.prepare('SELECT * FROM promos WHERE code = ?').get(code);
    assertPromoUsable(p, subtotal);
    res.json({ valid: true, promo: publicPromo(p), discount: computeDiscount(p, subtotal) });
  });

  return r;
};
module.exports.mapItem = mapItem;
