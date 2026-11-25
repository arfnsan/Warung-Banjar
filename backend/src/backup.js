const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

async function snapshot(source, target) {
  source = path.resolve(source); target = path.resolve(target);
  if (source === target || fs.existsSync(target)) throw new Error('Target must be a new database file.');
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Source integrity check failed');
    if (db.pragma('foreign_key_check').length) throw new Error('Source foreign key check failed');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await db.backup(target);
    fs.chmodSync(target, 0o600);
    const restored = new Database(target, { readonly: true });
    try {
      if (restored.pragma('integrity_check', { simple: true }) !== 'ok' || restored.pragma('foreign_key_check').length) throw new Error('Target verification failed');
    } finally { restored.close(); }
  } finally { db.close(); }
  return target;
}
if (require.main === module) {
  const [source, target] = process.argv.slice(2);
  if (!source || !target) { console.error('Usage: node src/backup.js SOURCE.db NEW_TARGET.db'); process.exitCode = 1; }
  else snapshot(source, target).then(console.log, error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { snapshot };
