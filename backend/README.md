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
npm run create-user          # opsional; akun juga bisa dibuat dari halaman login
npm start                   # http://localhost:3000  (menyajikan frontend + API sekaligus)
npm test                    # pengujian API, autentikasi, dan rate limit
```
Database dibuat otomatis di `backend/data/warban.db` dan diisi data menu dari `index.html` saat pertama jalan.

### Login pelanggan

Buka **http://localhost:3000/**. Pengunjung tanpa sesi diarahkan ke `/login.html`; semua `/api/*` selain `/api/auth/login` dan `/api/auth/register` meminta sesi valid. Pengguna dapat memilih **Daftar akun** di halaman login, mengisi username (3–50 karakter), kata sandi (8–1024 karakter), dan konfirmasi kata sandi. Setelah pendaftaran berhasil, masuk dengan akun tersebut. Username harus unik; pendaftaran dibatasi 5 permintaan per 15 menit per IP. Perintah `npm run create-user` tetap tersedia sebagai pilihan bagi pengelola. Tabel `users` menyimpan `username` dan `password_hash` (scrypt dengan salt acak), bukan kata sandi asli. Tabel `sessions` menyimpan hash token sesi dan waktu kedaluwarsa; cookie sesi HttpOnly, SameSite=Lax, dan Secure saat `NODE_ENV=production`. Logout mencabut sesi di database. Navbar menampilkan Login ketika belum masuk, lalu username dan Keluar setelah sesi terverifikasi. Jalankan melalui server Express ini, bukan Live Server atau membuka `index.html` langsung, karena serverlah yang menegakkan akses.

Endpoint admin tetap membutuhkan `ADMIN_API_KEY` selain sesi login; akun baru tidak mendapat hak admin. Login pada HTTP lokal hanya untuk pengembangan; gunakan HTTPS untuk deployment.

Untuk sementara, batas 5 percobaan per 15 menit pada login dan pendaftaran dinonaktifkan saat `NODE_ENV=development` (mode default). Batas tersebut tetap aktif di production. Validasi akun dan pembatasan API umum tetap berjalan.

Jika `index.html` atau `login.html` dibuka melalui `file://` atau Live Server lokal, `js/auth-client.js` mengarahkan browser ke `http://localhost:3000/login.html`. Backend harus berjalan (`npm.cmd start` di PowerShell dari folder `backend`). Untuk port backend selain 3000, buka URL backend tersebut langsung. Permintaan akun memakai origin backend yang sama supaya cookie sesi tetap berfungsi.

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


## ORM, cache Redis, backup dan restore

Model Sequelize `Product`, `Order`, dan `OrderItem` memetakan tabel SQLite yang sudah ada.
Detail produk dan pelacakan pesanan menggunakan model pada database berbasis file.
Transaksi pembuatan pesanan tetap menggunakan transaksi better-sqlite3 yang sudah ada;
`sequelize.sync()` tidak dijalankan sehingga schema/data lama tidak diubah otomatis.

Isi `REDIS_URL=redis://127.0.0.1:6379` untuk mengaktifkan cache daftar produk.
Cache berlaku 60 detik, dipisahkan berdasarkan filter, pencarian, urutan, limit dan offset.
Trigger SQLite mengganti versi cache setelah perubahan menu/kategori, termasuk melalui admin.
Header `X-Product-Cache` menunjukkan HIT, MISS atau BYPASS. Redis gagal terhubung saat
startup membuat aplikasi berjalan dengan SQLite; restart aplikasi setelah Redis pulih.
Harga checkout selalu dihitung dari database, bukan cache.

Benchmark HTTP lokal (database contoh terpisah, 10 warmup dan 100 sampel per mode):
```powershell
$env:REDIS_URL='redis://127.0.0.1:6379'
npm.cmd run benchmark:cache
```
Output memuat median dan p95 dalam milidetik untuk BYPASS dan HIT. Untuk sembilan produk,
Redis belum tentu lebih cepat daripada SQLite lokal. Script gagal tanpa menghasilkan
angka perbandingan jika Redis tidak tersedia.

Backup dan restore memakai SQLite online backup, mencakup WAL dan memeriksa integrity
serta foreign key. Target wajib berupa file baru agar database aktif tidak tertimpa:
```powershell
npm.cmd run backup -- data/warban.db backups/warban-backup.db
npm.cmd run backup -- backups/warban-backup.db backups/warban-restored.db
```
Untuk memakai hasil restore, hentikan server, arahkan `DB_PATH` ke file hasil restore,
lalu jalankan server kembali. Batasi akses Windows ACL pada folder backup; file berisi
data pelanggan, hash password dan sesi. Simpan salinan terenkripsi di lokasi terpisah.
`npm.cmd test` menguji kesamaan data setelah backup/restore, autentikasi hash setelah
restore, query ORM dengan input SQL injection, serta fallback cache saat Redis mati.
