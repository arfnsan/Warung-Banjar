const crypto = require('crypto');

const TZ = 'Asia/Makassar'; // WITA (Banjarmasin)

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

/** Tanggal & jam saat ini di WITA -> { date:'YYYY-MM-DD', time:'HH:MM', minutes:n } */
function nowWita(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  const time = `${parts.hour}:${parts.minute}`;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time, minutes: toMinutes(time) };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Tambah hari ke string tanggal YYYY-MM-DD */
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 0812-3456-789 / +62 812... / 62812... -> 62812... ; null jika tidak valid */
function normalizePhone(input) {
  let d = String(input || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? d : null;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode(prefix) {
  const { date } = nowWita();
  const ymd = date.slice(2).replace(/-/g, '');
  let r = '';
  for (let i = 0; i < 4; i++) r += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${prefix}-${ymd}-${r}`;
}

/** Jalankan fn(code) dan ulangi bila bentrok UNIQUE */
function withUniqueCode(prefix, fn, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      return fn(genCode(prefix));
    } catch (e) {
      if (!/UNIQUE/i.test(String(e.message))) throw e;
    }
  }
  throw new HttpError(500, 'Gagal membuat kode unik, coba lagi.');
}

const rupiah = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function paginate(query, def = 20, max = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(query.limit, 10) || def));
  return { page, limit, offset: (page - 1) * limit };
}

const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

module.exports = {
  TZ, HttpError, nowWita, toMinutes, toHHMM, addDays, isValidDate, normalizePhone,
  genCode, withUniqueCode, rupiah, safeEqual, paginate, likeEscape,
};
