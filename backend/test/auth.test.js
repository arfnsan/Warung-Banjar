process.env.DISABLE_RATE_LIMIT = '1';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { hashPassword, verifyPassword } = require('../src/auth');

test('daftar, validasi akun unik, login, dan logout menjaga akses halaman serta API', async () => {
  const db = openDb(':memory:');
  const hash = await hashPassword('rahasia-aman-123');
  assert.ok(!hash.includes('rahasia-aman-123'));
  assert.equal(await verifyPassword('rahasia-aman-123', hash), true);
  assert.equal(await verifyPassword('salah', hash), false);
  const app = createApp(db, { env: 'test', corsOrigins: [], adminKey: '', whatsapp: '', staticDir: path.resolve(__dirname, '../..') });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/', { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(base + '/api/menu')).status, 401);
    const register = (username, password) => fetch(base + '/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
    });
    assert.equal((await register('ab', 'rahasia-aman-123')).status, 400);
    assert.equal((await register('tester', 'pendek')).status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    const registrations = await Promise.all([register('tester', 'rahasia-aman-123'), register('tester', 'rahasia-aman-123')]);
    assert.deepEqual(registrations.map((r) => r.status).sort(), [201, 409]);
    for (const response of registrations) {
      assert.equal(response.headers.get('set-cookie'), null);
      const body = await response.json();
      assert.deepEqual(Object.keys(body).sort(), response.status === 201 ? ['message'] : ['error', 'message']);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    const stored = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('tester').password_hash;
    assert.notEqual(stored, hash); // Salt acak untuk password yang sama.
    assert.equal(await verifyPassword('rahasia-aman-123', stored), true);
    assert.equal((await fetch(base + '/', { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(base + '/api/menu')).status, 401);
    const wrong = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'wrong-password' }) });
    assert.equal(wrong.status, 401);
    const injected = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: "tester' OR 1=1 --", password: 'rahasia-aman-123' }) });
    assert.equal(injected.status, 401);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'rahasia-aman-123' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
    const me = await fetch(base + '/api/auth/me', { headers: { cookie } });
    assert.equal(me.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(await me.json()).sort(), ['id', 'username']);
    assert.equal((await fetch(base + '/', { headers: { cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/menu', { headers: { cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/menu', { headers: { cookie } })).status, 401);
  } finally { server.close(); db.close(); }
});
