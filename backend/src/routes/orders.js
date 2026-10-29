const express = require('express');
const { z } = require('zod');
const { getSettings } = require('../db');
const { HttpError, normalizePhone, withUniqueCode, rupiah } = require('../utils');
const { validate, formLimiter } = require('../middleware');
const { assertPromoUsable, computeDiscount } = require('../promo');

const phoneField = z.string().trim().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) ctx.addIssue({ code: 'custom', message: 'Nomor telepon/WhatsApp tidak valid (contoh: 0812xxxxxxxx).' });
  return p;
});

const orderSchema = z.object({
  customer_name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80),
  phone: phoneField,
  order_type: z.enum(['delivery', 'pickup']).default('delivery'),
  address: z.string().trim().max(300).default(''),
  notes: z.string().trim().max(300).default(''),
  payment_method: z.enum(['cod', 'transfer', 'qris']).default('cod'),
  promo_code: z.string().trim().toUpperCase().max(30).optional().or(z.literal('')),
  website: z.string().max(200).optional(), // honeypot
  items: z.array(z.object({
    menu_id: z.union([z.number().int().positive(), z.string().trim().min(1).max(80)]),
    qty: z.number().int().min(1, 'Jumlah minimal 1.').max(20, 'Maksimal 20 porsi per menu.'),
  })).min(1, 'Keranjang masih kosong.').max(30),
}).superRefine((o, ctx) => {
  if (o.order_type === 'delivery' && o.address.length < 8) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: 'Alamat pengantaran wajib diisi (min. 8 karakter).' });
  }
});

const trackSchema = z.object({ phone: phoneField });

function loadOrder(db, code) {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(code);
  if (!o) return null;
  o.items = db.prepare('SELECT menu_item_id, name, price, qty, price*qty AS line_total FROM order_items WHERE order_id = ?').all(o.id);
  return o;
}

function publicOrder(o) {
  return {
    code: o.code, status: o.status, order_type: o.order_type, customer_name: o.customer_name,
    address: o.address, notes: o.notes, payment_method: o.payment_method, promo_code: o.promo_code,
    items: o.items, subtotal: o.subtotal, discount: o.discount, delivery_fee: o.delivery_fee, total: o.total,
    created_at: o.created_at, updated_at: o.updated_at,
  };
}

function whatsappUrl(number, o) {
  const lines = [
    `Halo Warban, saya ingin konfirmasi pesanan *${o.code}*`,
    `Nama: ${o.customer_name}`,
    `Jenis: ${o.order_type === 'delivery' ? 'Antar' : 'Ambil sendiri'}`,
    ...(o.order_type === 'delivery' ? [`Alamat: ${o.address}`] : []),
    '',
    ...o.items.map((i) => `- ${i.name} x${i.qty} (${rupiah(i.line_total)})`),
    '',
    ...(o.discount ? [`Diskon: -${rupiah(o.discount)}`] : []),
    `Total: ${rupiah(o.total)}`,
    ...(o.notes ? ['', `Catatan: ${o.notes}`] : []),
  ];
  return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
}

module.exports = (db, config) => {
  const r = express.Router();

  /** Buat pesanan. Harga SELALU dihitung ulang di server (client tidak dipercaya). */
  r.post('/', formLimiter(15, 15), validate(orderSchema), (req, res) => {
    const body = req.valid;
    if (body.website) return res.status(201).json({ order: { code: 'WB-OK' } }); // bot: pura-pura sukses

    const settings = getSettings(db);

    const create = db.transaction(() => {
      // 1) gabungkan item duplikat & ambil harga dari DB
      const merged = new Map();
      for (const it of body.items) {
        const row = typeof it.menu_id === 'number'
          ? db.prepare('SELECT id,name,price,is_available FROM menu_items WHERE id = ?').get(it.menu_id)
          : db.prepare('SELECT id,name,price,is_available FROM menu_items WHERE slug = ?').get(it.menu_id);
        if (!row) throw new HttpError(400, `Menu "${it.menu_id}" tidak ditemukan.`, 'menu_not_found');
        if (!row.is_available) throw new HttpError(400, `Maaf, "${row.name}" sedang tidak tersedia.`, 'menu_unavailable');
        const cur = merged.get(row.id);
        const qty = (cur ? cur.qty : 0) + it.qty;
        if (qty > 20) throw new HttpError(400, `Maksimal 20 porsi untuk "${row.name}".`, 'qty_limit');
        merged.set(row.id, { ...row, qty });
      }
      const items = [...merged.values()];
      const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
      if (subtotal < settings.min_order) {
        throw new HttpError(400, `Minimal pemesanan ${rupiah(settings.min_order)}.`, 'min_order');
      }

      // 2) promo
      let discount = 0;
      let promoCode = null;
      if (body.promo_code) {
        const p = db.prepare('SELECT * FROM promos WHERE code = ?').get(body.promo_code);
        assertPromoUsable(p, subtotal);
        discount = computeDiscount(p, subtotal);
        promoCode = p.code;
        db.prepare('UPDATE promos SET used_count = used_count + 1 WHERE id = ?').run(p.id);
      }

      // 3) ongkir
      let deliveryFee = 0;
      if (body.order_type === 'delivery') {
        const free = settings.free_delivery_min > 0 && subtotal >= settings.free_delivery_min;
        deliveryFee = free ? 0 : settings.delivery_fee;
      }
      const total = subtotal - discount + deliveryFee;

      // 4) simpan
      const code = withUniqueCode('WB', (c) => {
        const info = db.prepare(`INSERT INTO orders
          (code,customer_name,phone,order_type,address,notes,payment_method,promo_code,subtotal,discount,delivery_fee,total)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          c, body.customer_name, body.phone, body.order_type,
          body.order_type === 'delivery' ? body.address : '', body.notes, body.payment_method,
          promoCode, subtotal, discount, deliveryFee, total);
        const ins = db.prepare('INSERT INTO order_items (order_id,menu_item_id,name,price,qty) VALUES (?,?,?,?,?)');
        for (const i of items) ins.run(info.lastInsertRowid, i.id, i.name, i.price, i.qty);
        return c;
      });
      return code;
    });

    const code = create();
    const order = loadOrder(db, code);
    res.status(201).json({
      message: 'Pesanan diterima! Kami akan segera mengonfirmasi.',
      order: publicOrder(order),
      whatsapp_url: whatsappUrl(config.whatsapp, order),
    });
  });

  /** Lacak pesanan: butuh kode + nomor HP yang dipakai saat memesan */
  r.get('/:code', formLimiter(60, 15), validate(trackSchema, 'query'), (req, res) => {
    const o = loadOrder(db, String(req.params.code).toUpperCase());
    // pesan sama untuk "tidak ada" & "HP salah" supaya kode pesanan tidak bisa ditebak
    if (!o || o.phone !== req.valid.phone) throw new HttpError(404, 'Pesanan tidak ditemukan.', 'not_found');
    res.json({ order: publicOrder(o) });
  });

  return r;
};
module.exports.loadOrder = loadOrder;
module.exports.publicOrder = publicOrder;
module.exports.phoneField = phoneField;
