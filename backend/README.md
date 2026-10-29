# Warban Backend

Backend untuk website **Warban – Warung Masakan Banjar**. Node.js + Express + SQLite (tanpa perlu install database terpisah).

## Fitur
| Area | Endpoint publik |
|---|---|
| Menu | `GET /api/menu?category=&q=&sort=&limit=`, `GET /api/menu/:id-atau-slug`, `GET /api/categories` |
| Pencarian populer | `GET /api/search/trending` (kata kunci tercatat otomatis saat `log=1`) |
| Promo & countdown | `GET /api/promo`, `GET /api/promo/validate?code=&subtotal=` |
| Pesanan | `POST /api/orders`, `GET /api/orders/:kode?phone=` (lacak) |
| Reservasi | `GET /api/reservations/availability?date=`, `POST /api/reservations`, `GET /api/reservations/:kode?phone=` |
| Kontak / Ulasan / Newsletter | `POST /api/contact`, `GET+POST /api/reviews`, `POST /api/newsletter` |
| Info warung | `GET /api/info` |

Admin (header `x-admin-key: <ADMIN_API_KEY>` atau `Authorization: Bearer ...`):
`/api/admin/stats`, `/orders` (+`PATCH /orders/:kode {status}`), `/reservations`, `/messages`, `/reviews` (moderasi),
`/menu` (CRUD + `PATCH /menu/:id/availability`), `/promos` (CRUD), `/subscribers`, `/settings`.

### Aturan bisnis penting
- **Harga selalu dihitung ulang di server**; harga dari browser diabaikan.
- Promo: persen, batas diskon maksimal, minimal belanja, kuota, masa berlaku. `is_daily` = berakhir tiap 23:59:59 WITA (dipakai countdown). Kuota dikembalikan bila pesanan dibatalkan.
- Alur status pesanan: `pending → confirmed → preparing → ready → (delivering) → completed`; `cancelled` bisa dari sebagian status.
- Reservasi: slot per 30 menit dari jam buka (09:00) sampai 1 jam sebelum tutup (22:00 → terakhir 21:00), kapasitas kursi per jendela 90 menit, minimal 1 jam dari sekarang, maksimal 60 hari ke depan. Semua pakai zona waktu WITA.
- Ulasan baru masuk moderasi dulu (tidak langsung tampil).
- Form publik dilindungi rate limit + honeypot (field `website`). Semua query SQL berparameter.
- Respons pesanan menyertakan `whatsapp_url` berisi ringkasan pesanan untuk konfirmasi via WA.

## Menjalankan
```bash
cd backend
npm install
cp .env.example .env        # lalu isi ADMIN_API_KEY
npm start                   # http://localhost:3000  (menyajikan frontend + API sekaligus)
npm test                    # 31 test
```
Database dibuat otomatis di `backend/data/warban.db` dan diisi data menu dari `index.html` saat pertama jalan.

Susunan folder yang diharapkan (taruh `backend/` di root repo frontend):
```
Warban-Banjar/
├─ backend/        <- folder ini
├─ css/ js/ img/ webfonts/ index.html
└─ js/warban-api.js  <- penghubung frontend (disertakan)
```
Server hanya menyajikan `index.html`, `css/`, `js/`, `img/`, `webfonts/`; folder `backend/` (termasuk `.env` & database) tidak pernah terekspos.

## Menghubungkan frontend
Tambahkan **setelah** `<script src="js/main.js"></script>` di `index.html` (paling bawah, sebelum `</body>`):
```html
<script src="js/warban-api.js"></script>
```
Alamat API ditentukan otomatis: origin yang sama bila backend yang menyajikan halaman (`npm start`), atau `http://localhost:3000` bila dibuka lewat Live Server / `file://`. Kalau backend di alamat lain, set sebelum script:
`<script>window.WARBAN_API_BASE = 'https://api.domainmu.com';</script>` (dan isi `CORS_ORIGINS` di `.env`).

Yang disambungkan **tanpa mengubah HTML**:
| Bagian di halaman | Perilaku baru |
|---|---|
| Kartu menu (`.mcard`) | harga, jumlah ulasan & stok disinkronkan dari server; menu yang dimatikan admin tampil abu-abu & tidak bisa ditambah |
| Jumlah menu di kartu kategori (`.catct`) | dihitung dari database |
| Popup menu → **Tambah Pesanan** (`#mpAddCart`) | masuk keranjang (tombol melayang `.cartfl` di kiri bawah) → checkout (nama, WA, antar/ambil, alamat, kode promo) → kode pesanan + tombol konfirmasi WhatsApp |
| Pencarian (`#searchInput`) | hasil langsung; Enter / tombol kaca pembesar membuka hidangan pertama; kata kunci populer dari data nyata |
| Promo (`#cdH/#cdM/#cdS`, **Ambil Promo**) | countdown ikut server (berakhir 23:59:59 WITA); tombol menyimpan kode `WARBAN30` ke keranjang |
| **Reservasi** (`#resBtn`) | tanggal minimal hari ini; jam yang penuh / di luar jam reservasi otomatis dinonaktifkan; kode `RS-…` tampil di pesan sukses |
| **Kontak** (`#ctcBtn`), **Newsletter** (`#nlBtn`) | tersimpan di database |
| Ikon hati (`.mhrt`) | favorit tersimpan di browser (localStorage) |

### Bug di `main.js` / HTML yang ikut diatasi `warban-api.js`
Semuanya dibypass tanpa mengubah file lamamu, tapi sebaiknya diperbaiki di sumbernya juga:
1. `#mpAddCart` membaca `#cartCount`, padahal elemennya di-comment di HTML → `TypeError`. Klik kini ditangkap lebih dulu.
2. Tombol newsletter membaca `#nlEmail`, padahal id di HTML `nlSurel` → `TypeError`.
3. Chip `.sovcat` di overlay pencarian punya `data-cat="burgers|pizza|chicken|..."` (sisa template) → `filterMenu()` menyembunyikan **semua** menu. Kini chip "Semua Menu" menampilkan semua, chip lain membuka hidangan bersangkutan.
4. Popup membaca `data-reviews` padahal atribut di kartu `data-ulasan` → muncul "(null reviews)".
5. Label popup masih Inggris ("Add to Cart", "Calories", "Prep Time", "reviews") → diterjemahkan.
6. Countdown di `main.js` selalu 08:45:30 (palsu). Elemen lamanya disembunyikan, yang tampil countdown dari server.

Catatan teknis: form di `index.html` bukan `<form>` dan inputnya tanpa `name`, jadi script mencocokkan field lewat teks `<label class="flbl">` (Nama / Telepon / Surel / Jumlah Tamu / Date / Time / Catatan / Keperluan / Pesan). Kalau teks label diganti, sesuaikan `LABELS` di `warban-api.js`.

Belum tersambung (belum ada UI-nya di HTML): form tulis ulasan (endpoint `POST /api/reviews` siap; slider ulasan masih statis) dan halaman lacak pesanan (`GET /api/orders/:kode?phone=`).

## Admin cepat (curl)
```bash
KEY=isi_admin_key
curl -H "x-admin-key: $KEY" localhost:3000/api/admin/stats
curl -H "x-admin-key: $KEY" "localhost:3000/api/admin/orders?status=pending"
curl -X PATCH -H "x-admin-key: $KEY" -H "content-type: application/json" \
     -d '{"status":"confirmed"}' localhost:3000/api/admin/orders/WB-261027-ABCD
curl -X PATCH -H "x-admin-key: $KEY" -H "content-type: application/json" \
     -d '{"is_available":false}' localhost:3000/api/admin/menu/3/availability
```

## Deploy
Butuh hosting Node.js dengan disk persisten (VPS, Railway/Render dengan volume, dsb). Set `NODE_ENV=production`, `ADMIN_API_KEY` panjang & acak, `DB_PATH` ke volume persisten, dan pasang HTTPS di depan (Nginx/Caddy). Backup cukup salin file `.db`. Hosting statis murni (GitHub Pages/Netlify) tidak bisa menjalankan backend ini.

## Pengaturan yang bisa diubah (PUT /api/admin/settings)
`open_time`, `close_time`, `reservation_last_seating_before_close` (menit sebelum tutup), `reservation_capacity`, `reservation_stay_minutes`, `reservation_max_days_ahead`, `reservation_max_guests`, `delivery_fee`, `free_delivery_min`, `min_order`.
Default ongkir Rp0 (sesuai "Gratis Antar" di topbar). Promo awal `WARBAN30` (30%, maks Rp30.000, min. belanja Rp20.000, berlaku harian) — ubah lewat `/api/admin/promos`.
