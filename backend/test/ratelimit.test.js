// Memastikan rate limiter form publik benar-benar aktif (DISABLE_RATE_LIMIT tidak di-set di file ini).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

test('form kontak dibatasi 5 request / 15 menit per IP', async () => {
  delete process.env.DISABLE_RATE_LIMIT;
  const db = openDb(':memory:');
  const app = createApp(db, { env: 'test', corsOrigins: [], adminKey: '', whatsapp: '62', staticDir: null });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/contact`;
  const send = () => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Tes', email: 'tes@example.com', message: 'halo semuanya' }),
  });
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await send()).status);
  server.close(); db.close();
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429, 429]);
});

test('admin API nonaktif (503) bila ADMIN_API_KEY kosong', async () => {
  process.env.DISABLE_RATE_LIMIT = '1';
  const db = openDb(':memory:');
  const app = createApp(db, { env: 'test', corsOrigins: [], adminKey: '', whatsapp: '62', staticDir: null });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/stats`, { headers: { 'x-admin-key': 'apa-saja' } });
  server.close(); db.close();
  assert.equal(res.status, 503);
});
