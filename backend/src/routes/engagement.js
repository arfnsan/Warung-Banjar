const express = require('express');
const { z } = require('zod');
const { validate, formLimiter } = require('../middleware');
const { normalizePhone } = require('../utils');

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80),
  email: z.email('Email tidak valid.').max(120),
  phone: z.string().trim().max(30).optional().transform((v) => (v ? normalizePhone(v) : null)),
  subject: z.string().trim().max(120).default(''),
  message: z.string().trim().min(5, 'Pesan terlalu pendek.').max(2000),
  website: z.string().max(200).optional(), // honeypot
});

const reviewSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(60),
  rating: z.coerce.number().int().min(1, 'Rating 1–5.').max(5, 'Rating 1–5.'),
  comment: z.string().trim().min(10, 'Ulasan minimal 10 karakter.').max(500),
  website: z.string().max(200).optional(),
});

const newsletterSchema = z.object({
  email: z.email('Email tidak valid.').max(120).transform((v) => v.toLowerCase()),
  website: z.string().max(200).optional(),
});

module.exports = (db) => {
  const r = express.Router();

  r.post('/contact', formLimiter(5, 15), validate(contactSchema), (req, res) => {
    const b = req.valid;
    if (!b.website) {
      db.prepare('INSERT INTO contact_messages (name,email,phone,subject,message) VALUES (?,?,?,?,?)')
        .run(b.name, b.email, b.phone, b.subject, b.message);
    }
    res.status(201).json({ message: 'Terima kasih! Pesan Anda sudah kami terima.' });
  });

  /** Ulasan yang sudah disetujui admin + ringkasan rating */
  r.get('/reviews', (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const items = db.prepare(`SELECT id,name,rating,comment,created_at FROM reviews
      WHERE is_approved = 1 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(limit, offset);
    const stat = db.prepare('SELECT COUNT(*) count, ROUND(AVG(rating),2) average FROM reviews WHERE is_approved = 1').get();
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of db.prepare('SELECT rating, COUNT(*) c FROM reviews WHERE is_approved = 1 GROUP BY rating').all()) dist[d.rating] = d.c;
    res.json({ summary: { count: stat.count, average: stat.average || 0, distribution: dist }, items });
  });

  /** Ulasan baru masuk antrean moderasi (tidak langsung tampil) */
  r.post('/reviews', formLimiter(5, 60), validate(reviewSchema), (req, res) => {
    const b = req.valid;
    if (!b.website) db.prepare('INSERT INTO reviews (name,rating,comment) VALUES (?,?,?)').run(b.name, b.rating, b.comment);
    res.status(201).json({ message: 'Terima kasih atas ulasannya! Ulasan akan tampil setelah ditinjau.' });
  });

  r.post('/newsletter', formLimiter(5, 15), validate(newsletterSchema), (req, res) => {
    const b = req.valid;
    if (!b.website) db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').run(b.email);
    // respons sama baik email baru maupun sudah terdaftar
    res.status(201).json({ message: 'Berhasil berlangganan. Terima kasih!' });
  });

  return r;
};
