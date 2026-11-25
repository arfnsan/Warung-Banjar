const { createClient } = require('redis');
const { randomUUID } = require('node:crypto');

function productCache(db, url) {
  if (!url) return null;
  db.exec(`CREATE TABLE IF NOT EXISTS product_cache_version (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL);
    INSERT OR IGNORE INTO product_cache_version VALUES(1,0);`);
  for (const table of ['menu_items', 'categories']) {
    for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS cache_${table}_${action} AFTER ${action} ON ${table}
        BEGIN UPDATE product_cache_version SET version=version+1 WHERE id=1; END;`);
    }
  }
  const client = createClient({ url, socket: { connectTimeout: 500, reconnectStrategy: false }, disableOfflineQueue: true });
  client.on('error', () => {});
  const ready = client.connect().catch(() => {});
  // ponytail: per-process namespace prevents stale entries after restore; use a
  // persistent database-generation ID if multiple workers need to share warm cache.
  const namespace = randomUUID();
  const commands = client.withCommandOptions({ timeout: 500, rejectInFlight: true });
  return {
    ready, client,
    async read(query, load) {
      const version = db.prepare('SELECT version FROM product_cache_version WHERE id=1').get().version;
      const key = `warban:products:${namespace}:${version}:${JSON.stringify(query)}`;
      if (client.isReady) {
        try { const value = await commands.get(key); if (value) return { rows: JSON.parse(value), status: 'HIT' }; } catch { /* database fallback */ }
      }
      const rows = load();
      if (client.isReady) {
        try { await commands.set(key, JSON.stringify(rows), { EX: 60 }); return { rows, status: 'MISS' }; } catch { /* cache is optional */ }
      }
      return { rows, status: 'BYPASS' };
    },
  };
}
module.exports = { productCache };
