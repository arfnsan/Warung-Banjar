// Uses an isolated database; no customer data or authentication bypass on the real server.
process.env.DISABLE_RATE_LIMIT = '1';
const { performance } = require('node:perf_hooks');
const { openDb } = require('./src/db');
const { seed } = require('./src/seed');
const { createApp } = require('./src/app');

(async () => {
  if (!process.env.REDIS_URL) throw new Error('Set REDIS_URL to a running Redis server.');
  const db = openDb(':memory:'); seed(db);
  const app = createApp(db, { env: 'test', corsOrigins: [], redisUrl: process.env.REDIS_URL });
  const cache = app.locals.productCache;
  await cache.ready;
  if (!cache.client.isReady) { db.close(); throw new Error('Redis unavailable; no benchmark reported.'); }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/menu`;
    const results = {};
    for (const mode of ['BYPASS', 'HIT']) {
      app.locals.productCache = mode === 'BYPASS' ? null : cache;
      for (let i = 0; i < 10; i++) await (await fetch(url)).json();
      const times = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now(); const response = await fetch(url); await response.json();
        if (!response.ok || response.headers.get('x-product-cache') !== mode) throw new Error('Unexpected cache state');
        times.push(performance.now() - start);
      }
      times.sort((a,b) => a-b);
      results[mode] = { samples: times.length, median_ms: times[50], p95_ms: times[94] };
    }
    console.log(JSON.stringify(results, null, 2));
  } finally { await new Promise(resolve => server.close(resolve)); cache.client.destroy(); db.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
