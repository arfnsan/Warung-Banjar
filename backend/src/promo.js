const { HttpError, nowWita } = require('./utils');

/** Waktu berakhir promo (epoch ms) atau null bila tanpa batas */
function promoEndsAtMs(p) {
  if (p.is_daily) return new Date(`${nowWita().date}T23:59:59+08:00`).getTime();
  return p.ends_at ? new Date(p.ends_at).getTime() : null;
}

/** Cek promo aktif. Melempar HttpError bila tidak bisa dipakai. */
function assertPromoUsable(p, subtotal, now = Date.now()) {
  if (!p || !p.is_active) throw new HttpError(400, 'Kode promo tidak ditemukan.', 'promo_invalid');
  if (p.starts_at && new Date(p.starts_at).getTime() > now) throw new HttpError(400, 'Promo belum dimulai.', 'promo_not_started');
  const end = promoEndsAtMs(p);
  if (end !== null && end < now) throw new HttpError(400, 'Promo sudah berakhir.', 'promo_expired');
  if (p.usage_limit != null && p.used_count >= p.usage_limit) throw new HttpError(400, 'Kuota promo sudah habis.', 'promo_exhausted');
  if (subtotal < p.min_order) {
    throw new HttpError(400, `Minimal belanja untuk promo ini Rp${p.min_order.toLocaleString('id-ID')}.`, 'promo_min_order');
  }
}

function computeDiscount(p, subtotal) {
  let d = Math.floor((subtotal * p.percent) / 100);
  if (p.max_discount != null) d = Math.min(d, p.max_discount);
  return Math.min(d, subtotal);
}

function publicPromo(p) {
  const end = promoEndsAtMs(p);
  return {
    code: p.code,
    title: p.title,
    description: p.description,
    percent: p.percent,
    max_discount: p.max_discount,
    min_order: p.min_order,
    ends_at: end ? new Date(end).toISOString() : null,
    seconds_left: end ? Math.max(0, Math.floor((end - Date.now()) / 1000)) : null,
  };
}

module.exports = { assertPromoUsable, computeDiscount, publicPromo, promoEndsAtMs };
