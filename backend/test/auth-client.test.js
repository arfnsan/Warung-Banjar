const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.resolve(__dirname, '../../js/auth-client.js'), 'utf8');
function client(url, fetch) {
  const redirects = [];
  const window = {};
  const location = new URL(url);
  location.replace = target => redirects.push(target);
  vm.runInNewContext(source, { window, location, fetch });
  return { window, redirects };
}

test('file langsung diarahkan ke backend tanpa mengirim kredensial', async () => {
  let requests = 0;
  const { window, redirects } = client('file:///C:/warban/login.html', () => { requests++; });
  await assert.rejects(window.warbanAuth('register', { username: 'tester', password: 'test-password' }), /Membuka halaman login/);
  assert.deepEqual(redirects, ['http://localhost:3000/login.html']);
  assert.equal(requests, 0);
});

test('Live Server diperiksa lewat GET lalu dialihkan, tanpa POST kata sandi', async () => {
  const requests = [];
  const { window, redirects } = client('http://127.0.0.1:5500/login.html', async (url, options) => {
    requests.push({ url, options });
    return new Response('<html>Cannot GET /api/auth/me</html>', { status: 404, headers: { 'content-type': 'text/html' } });
  });
  await assert.rejects(window.warbanAuth('register', { username: 'tester', password: 'test-password' }), /Membuka halaman login/);
  assert.deepEqual(redirects, ['http://localhost:3000/login.html']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.body, undefined);
});

test('backend pada origin sendiri menerima pendaftaran dan mempertahankan pesan validasi', async () => {
  const requests = [];
  const { window, redirects } = client('http://localhost:3011/login.html', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/me')) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (requests.length === 2) return Response.json({ message: 'Akun berhasil dibuat.' }, { status: 201 });
    return Response.json({ message: 'Username sudah digunakan.' }, { status: 409 });
  });
  const body = { username: 'tester', password: 'test-password' };
  assert.equal((await window.warbanAuth('register', body)).message, 'Akun berhasil dibuat.');
  assert.equal(requests[1].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[1].options.body), body);
  await assert.rejects(window.warbanAuth('register', body), error => error.status === 409 && error.message === 'Username sudah digunakan.');
  assert.deepEqual(redirects, []);
});

test('server mati memberi petunjuk dan permintaan bisa dicoba kembali', async () => {
  let online = false;
  const { window } = client('http://localhost:3000/login.html', async () => {
    if (!online) throw new TypeError('fetch failed');
    return Response.json({ message: 'Akun berhasil dibuat.' }, { status: 201 });
  });
  await assert.rejects(window.warbanAuth('register', {}), /npm.cmd start/);
  online = true;
  assert.equal((await window.warbanAuth('register', {})).message, 'Akun berhasil dibuat.');
});
