const express = require('express');
const { z } = require('zod');
const { getSettings, DEFAULT_SETTINGS } = require('../db');
const { HttpError, nowWita, paginate, isValidDate } = require('../utils');
const { validate } = require('../middleware');
const { loadOrder, publicOrder } = require('./orders');

const ORDER_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivering', 'completed'],
  delivering: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const RESV_STATUS = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];

const menuBody = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, 'Slug hanya huruf kecil, angka, dan strip.').min(2).max(80),
  category: z.string().trim().min(1), // slug kategori
  short_desc: z.string().trim().max(200).default(''),
  description: z.string().trim().max(1000).default(''),
  price: z.number().int().min(0).max(10_000_000),
  old_price: z.number().int().min(0).max(10_000_000).nullable().optional(),
  image: z.string().trim().max(200).nullable().optional(),
  calories: z.number().int().min(0).max(5000).nullable().optional(),
  prep_minutes: z.number().int().min(0).max(240).nullable().optional(),
  tags: z.array(z.string().trim().max(30)).max(10).default([]),
  badge: z.string().trim().max(20).nullable().optional(),
  badge_style: z.enum(['', 'hot', 'new']).nullable().optional(),
  is_available: z.boolean().default(true),
});

const promoBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Kode 3–30 karakter huruf/angka.'),
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(''),
  percent: z.number().int().min(1).max(100),
  max_discount: z.number().int().min(0).nullable().optional(),
  min_order: z.number().int().min(0).default(0),
  is_daily: z.boolean().default(false),
  starts_at: z.iso.datetime().nullable().optional(),
  ends_at: z.iso.datetime().nullable().optional(),
  usage_limit: z.number().int().min(1).nullable().optional(),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
});

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'ID tidak valid.', 'bad_id');
  return id;
};

module.exports = (db) => {
  const r = express.Router();
  const nowIso = () => new Date().toISOString();

  /* ---------- Dashboard ---------- */
  r.get('/stats', (_req, res) => {
    const today = nowWita().date;
    // created_at tersimpan UTC; WITA = UTC+8 -> pakai modifier '+8 hours'
    const q = (sql, ...p) => db.prepare(sql).get(...p);
    const todayOrders = q(`SELECT COUNT(*) n, COALESCE(SUM(total),0) revenue FROM orders
      WHERE status != 'cancelled' AND date(created_at,'+8 hours') = ?`, today);
    res.json({
      today,
      orders_today: todayOrders.n,
      revenue_today: todayOrders.revenue,
      pending_orders: q("SELECT COUNT(*) n FROM orders WHERE status = 'pending'").n,
      reservations_today: q("SELECT COUNT(*) n FROM reservations WHERE date = ? AND status IN ('pending','confirmed')", today).n,
      pending_reservations: q("SELECT COUNT(*) n FROM reservations WHERE status = 'pending'").n,
      unread_messages: q('SELECT COUNT(*) n FROM contact_messages WHERE is_read = 0').n,
      pending_reviews: q('SELECT COUNT(*) n FROM reviews WHERE is_approved = 0').n,
      subscribers: q('SELECT COUNT(*) n FROM newsletter_subscribers').n,
      top_items: db.prepare(`SELECT name, SUM(qty) sold FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status != 'cancelled' GROUP BY name ORDER BY sold DESC LIMIT 5`).all(),
    });
  });

  /* ---------- Pesanan ---------- */
  r.get('/orders', (req, res) => {
    const { page, limit, offset } = paginate(req.query);
    const where = [];
    const p = [];
    if (req.query.status) { where.push('status = ?'); p.push(String(req.query.status)); }
    if (req.query.date && isValidDate(String(req.query.date))) {
      where.push("date(created_at,'+8 hours') = ?"); p.push(String(req.query.date));
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM orders ${w}`).get(...p).n;
    const rows = db.prepare(`SELECT * FROM orders ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...p, limit, offset);
    const itemsStmt = db.prepare('SELECT name, price, qty FROM order_items WHERE order_id = ?');
    res.json({ page, limit, total, items: rows.map((o) => ({ ...o, items: itemsStmt.all(o.id) })) });
  });

  r.get('/orders/:code', (req, res) => {
    const o = loadOrder(db, req.params.code.toUpperCase());
    if (!o) throw new HttpError(404, 'Pesanan tidak ditemukan.', 'not_found');
    res.json({ order: { ...publicOrder(o), phone: o.phone } });
  });

  r.patch('/orders/:code', validate(z.object({ status: z.enum(Object.keys(ORDER_FLOW)) })), (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(req.params.code.toUpperCase());
    if (!o) throw new HttpError(404, 'Pesanan tidak ditemukan.', 'not_found');
    const next = req.valid.status;
    if (!ORDER_FLOW[o.status].includes(next)) {
      throw new HttpError(409, `Status tidak bisa diubah dari "${o.status}" ke "${next}". Boleh: ${ORDER_FLOW[o.status].join(', ') || '(final)'}.`, 'bad_transition');
    }
    if (next === 'delivering' && o.order_type !== 'delivery') {
      throw new HttpError(409, 'Pesanan ambil-sendiri tidak punya status "delivering".', 'bad_transition');
    }
    db.transaction(() => {
      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(next, nowIso(), o.id);
      // batal -> kembalikan kuota promo
      if (next === 'cancelled' && o.promo_code) db.prepare('UPDATE promos SET used_count = MAX(0, used_count - 1) WHERE code = ?').run(o.promo_code);
    })();
    res.json({ order: publicOrder(loadOrder(db, o.code)) });
  });

  /* ---------- Reservasi ---------- */
  r.get('/reservations', (req, res) => {
    const { page, limit, offset } = paginate(req.query);
    const where = [];
    const p = [];
    if (req.query.date && isValidDate(String(req.query.date))) { where.push('date = ?'); p.push(String(req.query.date)); }
    if (req.query.status) { where.push('status = ?'); p.push(String(req.query.status)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM reservations ${w}`).get(...p).n;
    const items = db.prepare(`SELECT * FROM reservations ${w} ORDER BY date DESC, time DESC LIMIT ? OFFSET ?`).all(...p, limit, offset);
    res.json({ page, limit, total, items });
  });

  r.patch('/reservations/:code', validate(z.object({ status: z.enum(RESV_STATUS) })), (req, res) => {
    const info = db.prepare('UPDATE reservations SET status = ? WHERE code = ?').run(req.valid.status, req.params.code.toUpperCase());
    if (!info.changes) throw new HttpError(404, 'Reservasi tidak ditemukan.', 'not_found');
    res.json({ reservation: db.prepare('SELECT * FROM reservations WHERE code = ?').get(req.params.code.toUpperCase()) });
  });

  /* ---------- Pesan kontak ---------- */
  r.get('/messages', (req, res) => {
    const { page, limit, offset } = paginate(req.query);
    const w = req.query.unread === '1' ? 'WHERE is_read = 0' : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM contact_messages ${w}`).get().n;
    const items = db.prepare(`SELECT * FROM contact_messages ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(limit, offset);
    res.json({ page, limit, total, items });
  });
  r.patch('/messages/:id', validate(z.object({ is_read: z.boolean() })), (req, res) => {
    const info = db.prepare('UPDATE contact_messages SET is_read = ? WHERE id = ?').run(req.valid.is_read ? 1 : 0, idParam(req));
    if (!info.changes) throw new HttpError(404, 'Pesan tidak ditemukan.', 'not_found');
    res.json({ ok: true });
  });
  r.delete('/messages/:id', (req, res) => {
    const info = db.prepare('DELETE FROM contact_messages WHERE id = ?').run(idParam(req));
    if (!info.changes) throw new HttpError(404, 'Pesan tidak ditemukan.', 'not_found');
    res.status(204).end();
  });

  /* ---------- Ulasan (moderasi) ---------- */
  r.get('/reviews', (req, res) => {
    const { page, limit, offset } = paginate(req.query);
    const w = req.query.approved === '0' ? 'WHERE is_approved = 0' : req.query.approved === '1' ? 'WHERE is_approved = 1' : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM reviews ${w}`).get().n;
    const items = db.prepare(`SELECT * FROM reviews ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(limit, offset);
    res.json({ page, limit, total, items });
  });
  r.patch('/reviews/:id', validate(z.object({ is_approved: z.boolean() })), (req, res) => {
    const info = db.prepare('UPDATE reviews SET is_approved = ? WHERE id = ?').run(req.valid.is_approved ? 1 : 0, idParam(req));
    if (!info.changes) throw new HttpError(404, 'Ulasan tidak ditemukan.', 'not_found');
    res.json({ ok: true });
  });
  r.delete('/reviews/:id', (req, res) => {
    const info = db.prepare('DELETE FROM reviews WHERE id = ?').run(idParam(req));
    if (!info.changes) throw new HttpError(404, 'Ulasan tidak ditemukan.', 'not_found');
    res.status(204).end();
  });

  /* ---------- Menu (CRUD) ---------- */
  const catId = (slug) => {
    const c = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
    if (!c) throw new HttpError(400, `Kategori "${slug}" tidak ada.`, 'bad_category');
    return c.id;
  };
  const menuParams = (b) => ({
    slug: b.slug, category_id: catId(b.category), name: b.name, short: b.short_desc, desc: b.description,
    price: b.price, old: b.old_price ?? null, img: b.image ?? null, cal: b.calories ?? null, time: b.prep_minutes ?? null,
    tags: JSON.stringify(b.tags), badge: b.badge || null, style: b.badge_style || null, avail: b.is_available ? 1 : 0,
  });
  const dupGuard = (fn) => {
    try { return fn(); } catch (e) {
      if (/UNIQUE/i.test(e.message)) throw new HttpError(409, 'Slug sudah dipakai menu lain.', 'duplicate');
      throw e;
    }
  };

  r.get('/menu', (_req, res) => {
    const rows = db.prepare(`SELECT m.*, c.slug category FROM menu_items m JOIN categories c ON c.id = m.category_id ORDER BY m.sort, m.id`).all();
    res.json({ items: rows.map((m) => ({ ...m, tags: JSON.parse(m.tags), is_available: !!m.is_available })) });
  });

  r.post('/menu', validate(menuBody), (req, res) => {
    const p = menuParams(req.valid);
    const id = dupGuard(() => db.prepare(`INSERT INTO menu_items
      (slug,category_id,name,short_desc,description,price,old_price,image,calories,prep_minutes,tags,badge,badge_style,is_available,sort)
      VALUES (@slug,@category_id,@name,@short,@desc,@price,@old,@img,@cal,@time,@tags,@badge,@style,@avail,
        (SELECT COALESCE(MAX(sort),0)+1 FROM menu_items))`).run(p).lastInsertRowid);
    res.status(201).json({ id: Number(id) });
  });

  r.put('/menu/:id', validate(menuBody), (req, res) => {
    const p = { ...menuParams(req.valid), id: idParam(req) };
    const info = dupGuard(() => db.prepare(`UPDATE menu_items SET slug=@slug, category_id=@category_id, name=@name, short_desc=@short,
      description=@desc, price=@price, old_price=@old, image=@img, calories=@cal, prep_minutes=@time, tags=@tags,
      badge=@badge, badge_style=@style, is_available=@avail WHERE id=@id`).run(p));
    if (!info.changes) throw new HttpError(404, 'Menu tidak ditemukan.', 'not_found');
    res.json({ ok: true });
  });

  r.patch('/menu/:id/availability', validate(z.object({ is_available: z.boolean() })), (req, res) => {
    const info = db.prepare('UPDATE menu_items SET is_available = ? WHERE id = ?').run(req.valid.is_available ? 1 : 0, idParam(req));
    if (!info.changes) throw new HttpError(404, 'Menu tidak ditemukan.', 'not_found');
    res.json({ ok: true });
  });

  r.delete('/menu/:id', (req, res) => {
    const info = db.prepare('DELETE FROM menu_items WHERE id = ?').run(idParam(req)); // riwayat pesanan tetap aman (snapshot nama & harga)
    if (!info.changes) throw new HttpError(404, 'Menu tidak ditemukan.', 'not_found');
    res.status(204).end();
  });

  /* ---------- Promo ---------- */
  r.get('/promos', (_req, res) => res.json({ items: db.prepare('SELECT * FROM promos ORDER BY id DESC').all() }));

  const promoParams = (b) => ({
    code: b.code, title: b.title, description: b.description, percent: b.percent, max_discount: b.max_discount ?? null,
    min_order: b.min_order, is_daily: b.is_daily ? 1 : 0, starts_at: b.starts_at ?? null, ends_at: b.ends_at ?? null,
    usage_limit: b.usage_limit ?? null, is_active: b.is_active ? 1 : 0, is_featured: b.is_featured ? 1 : 0,
  });
  r.post('/promos', validate(promoBody), (req, res) => {
    const id = dupGuard(() => db.prepare(`INSERT INTO promos
      (code,title,description,percent,max_discount,min_order,is_daily,starts_at,ends_at,usage_limit,is_active,is_featured)
      VALUES (@code,@title,@description,@percent,@max_discount,@min_order,@is_daily,@starts_at,@ends_at,@usage_limit,@is_active,@is_featured)`)
      .run(promoParams(req.valid)).lastInsertRowid);
    res.status(201).json({ id: Number(id) });
  });
  r.put('/promos/:id', validate(promoBody), (req, res) => {
    const info = dupGuard(() => db.prepare(`UPDATE promos SET code=@code,title=@title,description=@description,percent=@percent,
      max_discount=@max_discount,min_order=@min_order,is_daily=@is_daily,starts_at=@starts_at,ends_at=@ends_at,
      usage_limit=@usage_limit,is_active=@is_active,is_featured=@is_featured WHERE id=@id`)
      .run({ ...promoParams(req.valid), id: idParam(req) }));
    if (!info.changes) throw new HttpError(404, 'Promo tidak ditemukan.', 'not_found');
    res.json({ ok: true });
  });
  r.delete('/promos/:id', (req, res) => {
    const info = db.prepare('DELETE FROM promos WHERE id = ?').run(idParam(req));
    if (!info.changes) throw new HttpError(404, 'Promo tidak ditemukan.', 'not_found');
    res.status(204).end();
  });

  /* ---------- Newsletter & Pengaturan ---------- */
  r.get('/subscribers', (_req, res) => {
    res.json({ items: db.prepare('SELECT email, created_at FROM newsletter_subscribers ORDER BY id DESC').all() });
  });

  r.get('/settings', (_req, res) => res.json(getSettings(db)));
  r.put('/settings', validate(z.object({
    open_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    reservation_last_seating_before_close: z.number().int().min(0).max(240).optional(),
    reservation_capacity: z.number().int().min(1).max(1000).optional(),
    reservation_stay_minutes: z.number().int().min(30).max(360).optional(),
    reservation_max_days_ahead: z.number().int().min(1).max(365).optional(),
    reservation_max_guests: z.number().int().min(1).max(200).optional(),
    delivery_fee: z.number().int().min(0).max(1_000_000).optional(),
    free_delivery_min: z.number().int().min(0).max(100_000_000).optional(),
    min_order: z.number().int().min(0).max(100_000_000).optional(),
  }).strict()), (req, res) => {
    const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    db.transaction(() => {
      for (const [k, v] of Object.entries(req.valid)) if (k in DEFAULT_SETTINGS) up.run(k, String(v));
    })();
    res.json(getSettings(db));
  });

  return r;
};
