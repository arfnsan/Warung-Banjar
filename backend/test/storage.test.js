const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { createModels } = require('../src/models');
const { snapshot } = require('../src/backup');
const { hashPassword, verifyPassword } = require('../src/auth');
const { productCache } = require('../src/product-cache');
const { createApp } = require('../src/app');

test('ORM, parameterized lookup, WAL backup and restore preserve records and password hashes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warban-storage-'));
  const source = path.join(dir, 'source.db');
  const db = openDb(source); seed(db);
  const models = createModels(source);
  let restored;
  try {
    const product = await models.Product.findOne();
    assert.ok(product.price > 0);
    assert.equal(await models.Product.findOne({ where: { slug: "' OR 1=1 --" } }), null);
    const hash = await hashPassword('test-password-123');
    db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run('backup-user', hash);
    db.prepare("INSERT INTO orders(code,customer_name,phone,order_type,subtotal,total) VALUES('WB-TEST','Test','628123456789','pickup',25000,25000)").run();
    const order = await models.Order.findOne({ where: { code: 'WB-TEST' } });
    await models.OrderItem.create({ order_id: order.id, menu_item_id: product.id, name: product.name, price: 25000, qty: 1 });
    assert.equal((await models.Order.findByPk(order.id, { include: 'items' })).items.length, 1);
    const app = createApp(db, { env: 'test', corsOrigins: [] });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}/api`;
      const detail = await fetch(`${base}/menu/${product.id}`);
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).name, product.name);
      const tracked = await fetch(`${base}/orders/WB-TEST?phone=628123456789`);
      assert.equal(tracked.status, 200);
      assert.equal((await tracked.json()).order.items[0].line_total, 25000);
      assert.equal((await fetch(`${base}/orders/WB-TEST?phone=628111111111`)).status, 404);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await app.locals.models.sequelize.close();
    }
    await snapshot(source, path.join(dir, 'backup.db'));
    await snapshot(path.join(dir, 'backup.db'), path.join(dir, 'restore.db'));
    restored = openDb(path.join(dir, 'restore.db'));
    for (const table of ['menu_items', 'orders', 'order_items', 'users']) {
      assert.deepEqual(restored.prepare(`SELECT * FROM ${table}`).all(), db.prepare(`SELECT * FROM ${table}`).all());
    }
    assert.ok(await verifyPassword('test-password-123', restored.prepare('SELECT password_hash FROM users').get().password_hash));
    assert.equal(await verifyPassword('wrong-password', hash), false);
    await assert.rejects(snapshot(source, path.join(dir, 'restore.db')), /new database/);
    const cache = productCache(db, 'redis://127.0.0.1:1');
    await cache.ready;
    const before = db.prepare('SELECT version FROM product_cache_version').get().version;
    db.prepare('UPDATE menu_items SET price=price+1 WHERE id=?').run(product.id);
    assert.ok(db.prepare('SELECT version FROM product_cache_version').get().version > before);
    assert.deepEqual(await cache.read({}, () => ['fallback']), { rows: ['fallback'], status: 'BYPASS' });
  } finally {
    await models.sequelize.close(); restored?.close(); db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
