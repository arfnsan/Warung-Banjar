const config = require('./config');
const { openDb } = require('./db');
const { seed } = require('./seed');
const { createApp } = require('./app');

const db = openDb(config.dbPath);
seed(db);

const app = createApp(db, config);
const server = app.listen(config.port, () => {
  console.log(`Warban API jalan di http://localhost:${config.port}`);
  console.log(`  DB      : ${config.dbPath}`);
  console.log(`  Frontend: ${config.staticDir}`);
  if (!config.adminKey) console.warn('  [!] ADMIN_API_KEY belum di-set -> /api/admin/* nonaktif');
});

function shutdown(sig) {
  console.log(`\n${sig} diterima, menutup server...`);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
