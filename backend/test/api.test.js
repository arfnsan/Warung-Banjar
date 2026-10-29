process.env.DISABLE_RATE_LIMIT = '1';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');
const { nowWita, addDays } = require('../src/utils');

const ADMIN = 'test-admin-key-123';
let server, base, db;

const api = async (method, path, body, headers = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, body: json };
};
const admin = (m, p, b) => api(m, p, b, { 'x-admin-key': ADMIN });

before(async () => {
  db = openDb(':memory:');
  seed(db);
  const app = createApp(db, { env: 'test', corsOrigins: [], adminKey: ADMIN, whatsapp: '628085410098', staticDir: null });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); db.close(); });

/* ---------------- Menu ---------------- */
test('GET /menu mengembalikan 9 menu hasil seed', async () => {
  const r = await api('GET', '/menu');
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 9);
  const soto = r.body.items.find((i) => i.slug === 'soto-banjar');
  assert.equal(soto.price, 25000);
  assert.equal(soto.old_price, 30000);
  assert.equal(soto.discount_percent, 17);
  assert.deepEqual(soto.tags, ['Khas Banjar', 'Hangat', 'Terlaris']);
});

test('filter kategori & pencarian', async () => {
  const ikan = await api('GET', '/menu?category=ikan');
  assert.equal(ikan.body.count, 3);
  const kuah = await api('GET', '/menu?category=kuah');
  assert.equal(kuah.body.count, 3);
  const q = await api('GET', '/menu?q=patin');
  assert.deepEqual(q.body.items.map((i) => i.slug).sort(), ['ikan-patin-baubar', 'pais-patin']);
  const sorted = await api('GET', '/menu?sort=price_asc&limit=1');
  assert.equal(sorted.body.items[0].slug, 'bingka');
});

test('pencarian dengan karakter LIKE khusus tidak error / tidak match semua', async () => {
  const r = await api('GET', '/menu?q=' + encodeURIComponent('%'));
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 0);
});

test('kategori + jumlah item', async () => {
  const r = await api('GET', '/categories');
  assert.equal(r.body.total_items, 9);
  assert.equal(r.body.categories.find((c) => c.slug === 'kue').item_count, 1);
});

test('detail menu by id & slug, 404 bila tidak ada', async () => {
  assert.equal((await api('GET', '/menu/bingka')).body.name, 'Bingka');
  assert.equal((await api('GET', '/menu/1')).status, 200);
  assert.equal((await api('GET', '/menu/tidak-ada')).status, 404);
});

test('trending search bertambah saat log=1', async () => {
  await api('GET', '/menu?q=bingka&log=1');
  await api('GET', '/menu?q=bingka&log=1');
  const r = await api('GET', '/search/trending?limit=12');
  assert.ok(r.body.terms.find((t) => t.term === 'bingka' && t.hits === 2));
});

/* ---------------- Promo ---------------- */
test('promo unggulan aktif dengan countdown harian', async () => {
  const r = await api('GET', '/promo');
  assert.equal(r.body.active, true);
  assert.equal(r.body.promo.code, 'WARBAN30');
  assert.ok(r.body.promo.seconds_left > 0 && r.body.promo.seconds_left <= 86400);
});

test('validasi promo: minimal belanja & diskon dibatasi max_discount', async () => {
  const low = await api('GET', '/promo/validate?code=warban30&subtotal=10000');
  assert.equal(low.status, 400);
  assert.equal(low.body.error, 'promo_min_order');
  const ok = await api('GET', '/promo/validate?code=WARBAN30&subtotal=50000');
  assert.equal(ok.body.discount, 15000);
  const capped = await api('GET', '/promo/validate?code=WARBAN30&subtotal=200000');
  assert.equal(capped.body.discount, 30000); // dibatasi max_discount
  assert.equal((await api('GET', '/promo/validate?code=NGAWUR&subtotal=50000')).status, 400);
});

/* ---------------- Pesanan ---------------- */
const baseOrder = () => ({
  customer_name: 'Budi Santoso', phone: '0812-3456-7890', order_type: 'delivery',
  address: 'Jl. Kayu Tangi II No. 5, Banjarmasin', items: [{ menu_id: 'soto-banjar', qty: 2 }, { menu_id: 9, qty: 1 }],
});

test('buat pesanan: harga dihitung server, bukan client', async () => {
  const body = { ...baseOrder(), price: 1, total: 1, items: [{ menu_id: 'soto-banjar', qty: 2, price: 1 }, { menu_id: 9, qty: 1 }] };
  const r = await api('POST', '/orders', body);
  assert.equal(r.status, 201);
  const o = r.body.order;
  assert.match(o.code, /^WB-\d{6}-[A-Z0-9]{4}$/);
  assert.equal(o.subtotal, 25000 * 2 + 30000);
  assert.equal(o.total, 80000);
  assert.equal(o.status, 'pending');
  assert.match(r.body.whatsapp_url, /^https:\/\/wa\.me\/628085410098\?text=/);
});

test('pesanan dengan promo: diskon, used_count naik', async () => {
  const r = await api('POST', '/orders', { ...baseOrder(), promo_code: 'warban30' });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.discount, 24000); // 30% x 80.000
  assert.equal(r.body.order.total, 56000);
  assert.equal(db.prepare("SELECT used_count FROM promos WHERE code='WARBAN30'").get().used_count, 1);
});

test('item duplikat digabung; qty > 20 ditolak', async () => {
  const dup = await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 'bingka', qty: 2 }, { menu_id: 'bingka', qty: 3 }] });
  assert.equal(dup.body.order.items.length, 1);
  assert.equal(dup.body.order.items[0].qty, 5);
  const big = await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 'bingka', qty: 15 }, { menu_id: 'bingka', qty: 10 }] });
  assert.equal(big.status, 400);
});

test('validasi pesanan: keranjang kosong, HP salah, alamat wajib untuk antar, menu ngawur', async () => {
  assert.equal((await api('POST', '/orders', { ...baseOrder(), items: [] })).status, 400);
  assert.equal((await api('POST', '/orders', { ...baseOrder(), phone: '123' })).status, 400);
  const noAddr = await api('POST', '/orders', { ...baseOrder(), address: '' });
  assert.equal(noAddr.status, 400);
  assert.ok(noAddr.body.fields.address);
  const pickup = await api('POST', '/orders', { ...baseOrder(), order_type: 'pickup', address: '' });
  assert.equal(pickup.status, 201);
  assert.equal((await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 9999, qty: 1 }] })).status, 400);
  assert.equal((await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 'bingka', qty: -1 }] })).status, 400);
});

test('menu yang tidak tersedia tidak bisa dipesan', async () => {
  await admin('PATCH', '/admin/menu/8/availability', { is_available: false });
  const r = await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 8, qty: 1 }] });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'menu_unavailable');
  assert.equal((await api('GET', '/menu')).body.count, 8);
  await admin('PATCH', '/admin/menu/8/availability', { is_available: true });
});

test('lacak pesanan wajib nomor HP yang cocok', async () => {
  const { body } = await api('POST', '/orders', baseOrder());
  const code = body.order.code;
  assert.equal((await api('GET', `/orders/${code}?phone=081234567890`)).status, 200);
  assert.equal((await api('GET', `/orders/${code}?phone=081299999999`)).status, 404);
  assert.equal((await api('GET', `/orders/${code}`)).status, 400);
  assert.equal((await api('GET', '/orders/WB-000000-AAAA?phone=081234567890')).status, 404);
});

test('honeypot: bot dapat respons sukses tapi tidak ada yang tersimpan', async () => {
  const before = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
  const r = await api('POST', '/orders', { ...baseOrder(), website: 'http://spam' });
  assert.equal(r.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, before);
});

/* ---------------- Reservasi ---------------- */
const futureDate = () => addDays(nowWita().date, 3);
const resv = (o = {}) => ({ name: 'Siti', phone: '081355550000', date: futureDate(), time: '12:00', guests: 4, ...o });

test('availability menampilkan slot 09:00–21:00 per 30 menit', async () => {
  const r = await api('GET', `/reservations/availability?date=${futureDate()}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.slots[0].time, '09:00');
  assert.equal(r.body.slots.at(-1).time, '21:00');
  assert.ok(r.body.slots.every((s) => s.remaining_seats === 40));
});

test('buat reservasi + kapasitas berkurang pada slot yang tumpang tindih', async () => {
  const r = await api('POST', '/reservations', resv({ email: 'siti@example.com' }));
  assert.equal(r.status, 201);
  assert.match(r.body.reservation.code, /^RS-/);
  const av = await api('GET', `/reservations/availability?date=${futureDate()}`);
  assert.equal(av.body.slots.find((s) => s.time === '12:30').remaining_seats, 36);
  assert.equal(av.body.slots.find((s) => s.time === '15:00').remaining_seats, 40); // di luar durasi makan
});

test('reservasi ditolak bila kursi tidak cukup (409)', async () => {
  await api('POST', '/reservations', resv({ time: '18:00', guests: 30 }));
  const r = await api('POST', '/reservations', resv({ time: '18:00', guests: 20 }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'not_enough_seats');
});

test('validasi reservasi: tanggal lampau, terlalu jauh, jam di luar operasional, format', async () => {
  assert.equal((await api('POST', '/reservations', resv({ date: addDays(nowWita().date, -1) }))).status, 400);
  assert.equal((await api('POST', '/reservations', resv({ date: addDays(nowWita().date, 200) }))).status, 400);
  assert.equal((await api('POST', '/reservations', resv({ time: '23:00' }))).status, 400);
  assert.equal((await api('POST', '/reservations', resv({ time: '12:10' }))).status, 400);
  assert.equal((await api('POST', '/reservations', resv({ date: '2026-02-30' }))).status, 400);
  assert.equal((await api('POST', '/reservations', resv({ guests: 0 }))).status, 400);
  assert.equal((await api('POST', '/reservations', resv({ guests: 50 }))).status, 400);
});

/* ---------------- Kontak, ulasan, newsletter ---------------- */
test('form kontak tersimpan; validasi email', async () => {
  const ok = await api('POST', '/contact', { name: 'Andi', email: 'andi@example.com', subject: 'Katering', message: 'Apakah terima pesanan katering?' });
  assert.equal(ok.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM contact_messages').get().n, 1);
  assert.equal((await api('POST', '/contact', { name: 'Andi', email: 'bukan-email', message: 'halo halo' })).status, 400);
});

test('ulasan: masuk moderasi, tampil setelah disetujui admin', async () => {
  const post = await api('POST', '/reviews', { name: 'Rina', rating: 5, comment: 'Soto Banjarnya juara, kuahnya mantap!' });
  assert.equal(post.status, 201);
  assert.equal((await api('GET', '/reviews')).body.items.length, 0);
  const pending = await admin('GET', '/admin/reviews?approved=0');
  assert.equal(pending.body.total, 1);
  await admin('PATCH', `/admin/reviews/${pending.body.items[0].id}`, { is_approved: true });
  const pub = await api('GET', '/reviews');
  assert.equal(pub.body.items.length, 1);
  assert.equal(pub.body.summary.average, 5);
  assert.equal(pub.body.summary.distribution['5'], 1);
  assert.equal((await api('POST', '/reviews', { name: 'X', rating: 9, comment: 'terlalu bagus sekali' })).status, 400);
});

test('newsletter idempotent', async () => {
  await api('POST', '/newsletter', { email: 'Foo@Example.com' });
  await api('POST', '/newsletter', { email: 'foo@example.com' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM newsletter_subscribers').get().n, 1);
});

/* ---------------- Admin ---------------- */
test('admin: tanpa / salah kunci -> 401', async () => {
  assert.equal((await api('GET', '/admin/stats')).status, 401);
  assert.equal((await api('GET', '/admin/stats', null, { 'x-admin-key': 'salah' })).status, 401);
  assert.equal((await api('GET', '/admin/stats', null, { authorization: `Bearer ${ADMIN}` })).status, 200);
});

test('admin: alur status pesanan valid & transisi ilegal ditolak', async () => {
  const { body } = await api('POST', '/orders', { ...baseOrder(), promo_code: 'WARBAN30' });
  const code = body.order.code;
  const used = () => db.prepare("SELECT used_count FROM promos WHERE code='WARBAN30'").get().used_count;
  const usedBefore = used();
  assert.equal((await admin('PATCH', `/admin/orders/${code}`, { status: 'completed' })).status, 409);
  assert.equal((await admin('PATCH', `/admin/orders/${code}`, { status: 'confirmed' })).body.order.status, 'confirmed');
  assert.equal((await admin('PATCH', `/admin/orders/${code}`, { status: 'cancelled' })).body.order.status, 'cancelled');
  assert.equal(used(), usedBefore - 1); // kuota promo dikembalikan
  assert.equal((await admin('PATCH', `/admin/orders/${code}`, { status: 'confirmed' })).status, 409); // final
});

test('admin: CRUD menu + slug duplikat', async () => {
  const item = { name: 'Katupat Kandangan', slug: 'katupat-kandangan', category: 'kuah', price: 27000, tags: ['Khas Banjar'] };
  const c = await admin('POST', '/admin/menu', item);
  assert.equal(c.status, 201);
  assert.equal((await admin('POST', '/admin/menu', item)).status, 409);
  assert.equal((await api('GET', '/menu/katupat-kandangan')).body.price, 27000);
  assert.equal((await admin('PUT', `/admin/menu/${c.body.id}`, { ...item, price: 29000 })).status, 200);
  assert.equal((await api('GET', '/menu/katupat-kandangan')).body.price, 29000);
  assert.equal((await admin('POST', '/admin/menu', { ...item, slug: 'x-y', category: 'nggak-ada' })).status, 400);
  assert.equal((await admin('DELETE', `/admin/menu/${c.body.id}`)).status, 204);
  assert.equal((await api('GET', '/menu/katupat-kandangan')).status, 404);
});

test('admin: hapus menu tidak merusak riwayat pesanan', async () => {
  const { body } = await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 'pais-patin', qty: 1 }] });
  const id = (await api('GET', '/menu/pais-patin')).body.id;
  assert.equal((await admin('DELETE', `/admin/menu/${id}`)).status, 204);
  const o = await admin('GET', `/admin/orders/${body.order.code}`);
  assert.equal(o.body.order.items[0].name, 'Pais Patin');
  assert.equal(o.body.order.items[0].menu_item_id, null);
});

test('admin: promo, pengaturan (ongkir mempengaruhi total), stats', async () => {
  const p = await admin('POST', '/admin/promos', { code: 'hemat5', title: 'Hemat', percent: 5, is_featured: false });
  assert.equal(p.status, 201);
  assert.equal((await api('GET', '/promo/validate?code=HEMAT5&subtotal=10000')).body.discount, 500);

  await admin('PUT', '/admin/settings', { delivery_fee: 5000, free_delivery_min: 100000 });
  const small = await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 'bingka', qty: 1 }] });
  assert.equal(small.body.order.delivery_fee, 5000);
  assert.equal(small.body.order.total, 20000);
  const big = await api('POST', '/orders', { ...baseOrder(), items: [{ menu_id: 'bingka', qty: 8 }] });
  assert.equal(big.body.order.delivery_fee, 0); // 120.000 >= batas gratis ongkir
  const pick = await api('POST', '/orders', { ...baseOrder(), order_type: 'pickup', items: [{ menu_id: 'bingka', qty: 1 }] });
  assert.equal(pick.body.order.delivery_fee, 0);
  assert.equal((await admin('PUT', '/admin/settings', { ngawur: 1 })).status, 400);
  await admin('PUT', '/admin/settings', { delivery_fee: 0, free_delivery_min: 0 });

  const s = await admin('GET', '/admin/stats');
  assert.ok(s.body.orders_today > 0 && s.body.revenue_today > 0);
  assert.ok(s.body.top_items.length > 0);
  assert.equal(s.body.unread_messages, 1);
});

test('error handling: JSON rusak -> 400, route tak dikenal -> 404 JSON', async () => {
  const bad = await fetch(base + '/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  const nf = await api('GET', '/tidak-ada');
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error, 'not_found');
});

test('SQL injection di query pencarian tidak berefek', async () => {
  const r = await api('GET', '/menu?q=' + encodeURIComponent("'; DROP TABLE menu_items; --"));
  assert.equal(r.status, 200);
  assert.equal((await api('GET', '/menu')).status, 200);
});
