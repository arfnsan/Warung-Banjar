const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('reservasi memakai satu submit, menahan pengiriman berulang, dan bisa dicoba setelah gagal', async () => {
  const read = file => readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
  assert.doesNotMatch(read('js/main.js'), /reservationForm|\/api\/reservations/);
  assert.match(read('index.html'), /<button type="submit"[^>]*id="resBtn"/);
  const source = read('js/warban-api.js');
  const handlers = {};
  const form = { addEventListener(type, handler) {
    assert.equal(handlers[type], undefined);
    handlers[type] = handler;
  } };
  const button = { form, innerHTML: 'Reservasi', disabled: false };
  const field = { value: 'Ayu', tagName: 'INPUT' };
  const container = { appendChild() {} };
  const requests = [];
  const messages = [];
  const context = {
    $: selector => selector === '#resBtn' ? button : container,
    $$: () => [field],
    h: () => ({ value: '' }),
    findField: () => field,
    readField: (key, el) => el.value,
    LABEL_ID: { name: 'Nama' },
    toast: message => messages.push(message),
    document: { addEventListener() { assert.fail('Form must not register a click handler'); } },
    api: (endpoint, options) => new Promise((resolve, reject) => requests.push({ endpoint, options, resolve, reject })),
  };
  vm.runInNewContext(source.slice(source.indexOf('  function bindAction(cfg)'), source.indexOf('  /* Reservasi: tanggal')), {
    ...context,
    // Only mount the reservation card; contact/newsletter have no matching container here.
    $: selector => selector === '#reservation .fcard' ? container : selector === '#resBtn' ? button : null,
    refreshSlots() {},
  });
  const submit = () => {
    let prevented = false;
    handlers.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  submit(); // Both a submit button's default action and Enter emit submit.
  submit();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].endpoint, '/reservations');
  assert.equal(button.disabled, true);
  requests[0].reject(new Error('Server unavailable'));
  await settle();
  assert.equal(button.disabled, false);
  assert.equal(field.value, 'Ayu');
  assert.ok(messages.includes('Server unavailable'));
  submit();
  assert.equal(requests.length, 2);
  requests[1].resolve({ reservation: { code: 'RES-123' } });
  await settle();
  assert.equal(field.value, '');
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, 'Reservasi');
  assert.ok(messages.some(message => message.includes('RES-123')));
});
