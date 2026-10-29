const rateLimit = require('express-rate-limit');
const { ZodError } = require('zod');
const { HttpError, safeEqual } = require('./utils');

// Hanya dipakai di test otomatis. Jangan di-set di production.
const skip = () => process.env.DISABLE_RATE_LIMIT === '1';

/** Batasi endpoint tulis (form publik) agar tidak di-spam */
const formLimiter = (max = 10, windowMin = 15) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip,
    message: { error: 'rate_limited', message: 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.' },
  });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: 'rate_limited', message: 'Terlalu banyak permintaan.' },
});

/** Auth admin sederhana via API key: header "x-admin-key" atau "Authorization: Bearer ..." */
function requireAdmin(adminKey) {
  return (req, _res, next) => {
    if (!adminKey) return next(new HttpError(503, 'Admin API belum diaktifkan (set ADMIN_API_KEY).', 'admin_disabled'));
    const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const given = req.get('x-admin-key') || bearer;
    if (!given || !safeEqual(given, adminKey)) return next(new HttpError(401, 'Kunci admin tidak valid.', 'unauthorized'));
    next();
  };
}

/** Validasi body/query dengan zod, hasil parse ditaruh di req.valid */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const r = schema.safeParse(req[source]);
  if (!r.success) return next(r.error);
  req.valid = r.data;
  next();
};

function notFound(_req, _res, next) {
  next(new HttpError(404, 'Endpoint tidak ditemukan.', 'not_found'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const i of err.issues) {
      const k = i.path.join('.') || '_';
      if (!fields[k]) fields[k] = i.message;
    }
    const first = err.issues[0];
    const where = first.path.length ? `${first.path.join('.')}: ` : '';
    return res.status(400).json({ error: 'validation_error', message: where + first.message, fields });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_json', message: 'Format JSON tidak valid.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'too_large', message: 'Data terlalu besar.' });
  }
  console.error(err);
  res.status(500).json({ error: 'server_error', message: 'Terjadi kesalahan pada server.' });
}

module.exports = { formLimiter, apiLimiter, requireAdmin, validate, notFound, errorHandler };
