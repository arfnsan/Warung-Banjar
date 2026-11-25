const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { stdin, stdout } = require('node:process');
const config = require('./config');
const { openDb } = require('./db');
const { hashPassword } = require('./auth');

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const username = (await rl.question('Username (3-50 karakter): ')).trim();
    rl.close();
    const hiddenOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
    const hidden = readline.createInterface({ input: stdin, output: hiddenOutput, terminal: true });
    stdout.write('Kata sandi (minimal 8 karakter): ');
    const password = await hidden.question('');
    hidden.close();
    stdout.write('\n');
    if (username.length < 3 || username.length > 50 || password.length < 8 || password.length > 1024) throw new Error('Username atau kata sandi tidak memenuhi batas panjang.');
    const db = openDb(config.dbPath);
    try {
      db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, await hashPassword(password));
      stdout.write('Akun berhasil dibuat.\n');
    } finally { db.close(); }
  } finally { rl.close(); }
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
