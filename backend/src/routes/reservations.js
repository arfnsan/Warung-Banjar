const express = require('express');
const { z } = require('zod');
const { getSettings } = require('../db');
const { HttpError, nowWita, toMinutes, toHHMM, addDays, isValidDate, withUniqueCode } = require('../utils');
const { validate, formLimiter } = require('../middleware');
const { phoneField } = require('./orders');

const SLOT_STEP = 30;         // menit
const MIN_LEAD_MINUTES = 60;  // minimal booking 1 jam dari sekarang

const dateStr = z.string().trim().refine(isValidDate, 'Format tanggal harus YYYY-MM-DD.');
const timeStr = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:MM.');

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80),
  phone: phoneField,
  email: z.union([z.literal(''), z.email('Email tidak valid.').max(120)]).optional(),
  date: dateStr,
  time: timeStr,
  guests: z.coerce.number().int().min(1, 'Jumlah tamu minimal 1.').max(100),
  notes: z.string().trim().max(300).default(''),
  website: z.string().max(200).optional(), // honeypot
});

module.exports = (db) => {
  const r = express.Router();

  /** Daftar jam yang bisa dipesan pada suatu tanggal beserta sisa kursi */
  function slotsFor(date, settings) {
    const open = toMinutes(settings.open_time);
    const lastSeat = toMinutes(settings.close_time) - settings.reservation_last_seating_before_close;
    const stay = settings.reservation_stay_minutes;
    const now = nowWita();

    const booked = db.prepare(
      "SELECT time, guests FROM reservations WHERE date = ? AND status IN ('pending','confirmed')").all(date)
      .map((b) => ({ m: toMinutes(b.time), g: b.guests }));

    const slots = [];
    for (let m = open; m <= lastSeat; m += SLOT_STEP) {
      const used = booked.filter((b) => Math.abs(b.m - m) < stay).reduce((a, b) => a + b.g, 0);
      const past = date === now.date && m < now.minutes + MIN_LEAD_MINUTES;
      const remaining = Math.max(0, settings.reservation_capacity - used);
      slots.push({ time: toHHMM(m), remaining_seats: remaining, available: !past && remaining > 0 });
    }
    return slots;
  }

  function assertDateInRange(date, settings) {
    const today = nowWita().date;
    if (date < today) throw new HttpError(400, 'Tanggal reservasi tidak boleh di masa lalu.', 'date_past');
    if (date > addDays(today, settings.reservation_max_days_ahead)) {
      throw new HttpError(400, `Reservasi maksimal ${settings.reservation_max_days_ahead} hari ke depan.`, 'date_too_far');
    }
  }

  r.get('/availability', validate(z.object({ date: dateStr }), 'query'), (req, res) => {
    const settings = getSettings(db);
    assertDateInRange(req.valid.date, settings);
    res.json({
      date: req.valid.date,
      hours: { open: settings.open_time, close: settings.close_time },
      max_guests: settings.reservation_max_guests,
      slots: slotsFor(req.valid.date, settings),
    });
  });

  r.post('/', formLimiter(8, 15), validate(createSchema), (req, res) => {
    const b = req.valid;
    if (b.website) return res.status(201).json({ reservation: { code: 'RS-OK' } });

    const settings = getSettings(db);
    if (b.guests > settings.reservation_max_guests) {
      throw new HttpError(400, `Untuk lebih dari ${settings.reservation_max_guests} tamu, silakan hubungi kami langsung.`, 'too_many_guests');
    }
    assertDateInRange(b.date, settings);

    const create = db.transaction(() => {
      const slot = slotsFor(b.date, settings).find((s) => s.time === b.time);
      if (!slot) {
        throw new HttpError(400, `Jam reservasi ${settings.open_time}–${toHHMM(toMinutes(settings.close_time) - settings.reservation_last_seating_before_close)} (kelipatan 30 menit).`, 'time_invalid');
      }
      if (!slot.available) throw new HttpError(409, 'Maaf, jam tersebut sudah penuh atau sudah lewat. Pilih jam lain.', 'slot_unavailable');
      if (b.guests > slot.remaining_seats) {
        throw new HttpError(409, `Sisa kursi pada jam tersebut hanya ${slot.remaining_seats}.`, 'not_enough_seats');
      }
      return withUniqueCode('RS', (code) => {
        db.prepare(`INSERT INTO reservations (code,name,phone,email,date,time,guests,notes) VALUES (?,?,?,?,?,?,?,?)`)
          .run(code, b.name, b.phone, b.email || null, b.date, b.time, b.guests, b.notes);
        return code;
      });
    });

    const code = create();
    const row = db.prepare('SELECT code,name,date,time,guests,notes,status,created_at FROM reservations WHERE code = ?').get(code);
    res.status(201).json({ message: 'Reservasi diterima! Kami akan mengonfirmasi lewat WhatsApp.', reservation: row });
  });

  r.get('/:code', formLimiter(60, 15), validate(z.object({ phone: phoneField }), 'query'), (req, res) => {
    const row = db.prepare('SELECT * FROM reservations WHERE code = ?').get(String(req.params.code).toUpperCase());
    if (!row || row.phone !== req.valid.phone) throw new HttpError(404, 'Reservasi tidak ditemukan.', 'not_found');
    const { id, phone, ...pub } = row; // eslint-disable-line no-unused-vars
    res.json({ reservation: pub });
  });

  return r;
};
