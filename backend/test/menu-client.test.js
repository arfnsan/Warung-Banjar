const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('katalog dirender dari API, nama boleh sama/berubah tanpa mengubah ID', async () => {
  const source = readFileSync(path.resolve(__dirname, '../../js/warban-api.js'), 'utf8');
  const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  assert.doesNotMatch(html, /class="mcard"|class="sovcat"/);
  assert.doesNotMatch(source, /findMenuByName|cardByName/);
  const h = (tag, attrs, ...children) => ({ tag, attrs: attrs || {}, children: children.filter(Boolean),
    appendChild(child) { this.children.push(child); },
    replaceChildren(...items) { this.children = items; },
    getAttribute(key) { return String(this.attrs[key]); },
  });
  const grid = h('div'), chips = h('div');
  const item = { id: 1, name: 'Nama sama', category: { slug: 'ikan', name: 'Ikan' }, price: 10000,
    old_price: null, rating: 4, review_count: 2, description: '<b>Deskripsi admin</b>', short_desc: 'Ringkas',
    tags: ['<img onerror=alert(1)>'], is_available: true };
  const context = { h, menu: [item, { ...item, id: 2 }], window: {}, paintHeart() {}, rupiah: String,
    $: selector => selector === '#mgrid' ? grid : selector === '.sovcats' ? chips : null };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function findMenuById'), source.indexOf('  // Bungkus openMenuPop')) +
    source.slice(source.indexOf('  function renderMenuCards'), source.indexOf('  function syncCategoryCounts')), context);
  context.renderMenuCards();
  assert.equal(grid.children.length, 2);
  assert.equal(grid.children[1].children[0].attrs['data-menu-id'], 2);
  assert.equal(context.findMenuById('2').id, 2);
  context.menu = [{ ...item, name: 'Nama baru', description: 'Deskripsi baru', price: 20000 }];
  context.renderMenuCards();
  const card = grid.children[0].children[0];
  assert.equal(grid.children.length, 1);
  assert.equal(card.attrs['data-title'], 'Nama baru');
  assert.equal(card.attrs['data-desc'], 'Deskripsi baru');
  assert.equal(card.attrs['data-price'], '20000');
  assert.equal(chips.children[1].attrs['data-menu-id'], 1);
  context.menu = [];
  context.renderMenuCards();
  assert.equal(grid.children[0].attrs.role, 'status');

  const offsets = [];
  context.api = async url => {
    offsets.push(url);
    return { items: offsets.length === 1 ? Array.from({ length: 100 }, (_, id) => ({ ...item, id })) : [{ ...item, id: 100 }] };
  };
  vm.runInContext(source.slice(source.indexOf('  function loadMenu'), source.indexOf('  var menuReady')), context);
  await context.loadMenu(0);
  assert.equal(context.menu.length, 101);
  assert.deepEqual(offsets, ['/menu?limit=100&offset=0', '/menu?limit=100&offset=100']);
});
