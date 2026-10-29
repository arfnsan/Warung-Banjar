/**
 * Seed data awal. Data menu diambil dari index.html (atribut data-* pada .mcard).
 * Aman dijalankan berulang: hanya mengisi tabel yang masih kosong.
 *   npm run seed
 */
const CATEGORIES = [
  { slug: 'utama', name: 'Masakan Utama', image: 'img/menu/5.jpg' },
  { slug: 'ikan', name: 'Hidangan Ikan', image: 'img/menu/3.jpg' },
  { slug: 'nasi', name: 'Nasi & Lauk', image: 'img/menu/4.jpg' },
  { slug: 'kuah', name: 'Hidangan Berkuah', image: 'img/menu/2.jpg' },
  { slug: 'kue', name: 'Kue Tradisional', image: 'img/menu/9.jpg' },
];

const MENU = [
  { slug: 'soto-banjar', cat: 'kuah', name: 'Soto Banjar', price: 25000, old: 30000, img: 'img/menu/2.jpg', rating: 4.9, reviews: 128, cal: 320, time: 12,
    short: 'Kuah rempah gurih dengan ayam suwir, telur, soun, perkedel dan bawang goreng',
    desc: 'Soto khas Banjar dengan kuah gurih berbumbu rempah, suwiran ayam, telur, soun, perkedel dan taburan bawang goreng.',
    tags: ['Khas Banjar', 'Hangat', 'Terlaris'], badge: 'Terlaris', style: 'hot' },
  { slug: 'ikan-patin-baubar', cat: 'ikan', name: 'Ikan Patin Baubar', price: 32000, old: 38000, img: 'img/menu/3.jpg', rating: 4.8, reviews: 95, cal: 410, time: 18,
    short: 'Ikan patin bakar harum dengan bumbu khas Banjar yang gurih dan kaya rempah',
    desc: 'Ikan patin yang dibakar hingga harum lalu disajikan dengan bumbu khas Banjar yang gurih dan kaya rempah.',
    tags: ['Ikan', 'Khas Banjar', 'Panggang'], badge: 'Baru', style: 'new' },
  { slug: 'nasi-kuning-banjar', cat: 'nasi', name: 'Nasi Kuning Banjar', price: 22000, old: 27000, img: 'img/menu/4.jpg', rating: 4.9, reviews: 110, cal: 520, time: 15,
    short: 'Nasi kuning gurih dengan lauk berbumbu, serundeng, telur dan pelengkap segar',
    desc: 'Nasi kuning gurih khas Banjar disajikan dengan lauk berbumbu, serundeng, telur dan pelengkap segar.',
    tags: ['Nasi', 'Khas Banjar', 'Hangat'], badge: 'Favorit', style: '' },
  { slug: 'ayam-masak-habang', cat: 'utama', name: 'Ayam Masak Habang', price: 28000, old: 33000, img: 'img/menu/5.jpg', rating: 4.9, reviews: 140, cal: 460, time: 15,
    short: 'Ayam dengan bumbu habang khas Banjar yang gurih, harum dan pedas manis',
    desc: 'Ayam dimasak dengan bumbu habang khas Banjar yang kaya rempah, gurih, harum dan memiliki rasa pedas manis yang khas.',
    tags: ['Ayam', 'Khas Banjar', 'Pedas'], badge: 'Favorit', style: 'hot' },
  { slug: 'iwak-karing-betanak', cat: 'ikan', name: 'Iwak Karing Betanak', price: 25000, old: 29000, img: 'img/menu/6.jpg', rating: 4.8, reviews: 88, cal: 390, time: 15,
    short: 'Ikan kering dimasak santan dan rempah Banjar dengan cita rasa gurih dan harum',
    desc: 'Ikan kering yang dimasak bersama santan dan bumbu rempah Banjar hingga menghasilkan rasa gurih dan harum.',
    tags: ['Ikan', 'Santan', 'Khas Banjar'], badge: 'Baru', style: 'new' },
  { slug: 'gangan-asam-banjar', cat: 'kuah', name: 'Gangan Asam Banjar', price: 24000, old: 28000, img: 'img/menu/7.jpg', rating: 4.8, reviews: 76, cal: 280, time: 14,
    short: 'Kuah asam khas Banjar dengan ikan dan sayuran segar, gurih dan menyegarkan',
    desc: 'Sayur berkuah asam khas Banjar dengan ikan dan sayuran segar, menghasilkan rasa segar, gurih dan sedikit pedas.',
    tags: ['Segar', 'Kuah', 'Khas Banjar'], badge: null, style: null },
  { slug: 'lontong-banjar', cat: 'kuah', name: 'Lontong Banjar', price: 20000, old: 24000, img: 'img/menu/8.jpg', rating: 4.8, reviews: 64, cal: 430, time: 12,
    short: 'Lontong dengan kuah santan berbumbu dan sayuran, gurih serta mengenyangkan',
    desc: 'Lontong khas Banjar dengan kuah santan berbumbu, sayuran dan pelengkap yang membuatnya gurih serta mengenyangkan.',
    tags: ['Lontong', 'Santan', 'Khas Banjar'], badge: null, style: null },
  { slug: 'bingka', cat: 'kue', name: 'Bingka', price: 15000, old: 18000, img: 'img/menu/9.jpg', rating: 4.9, reviews: 102, cal: 310, time: 8,
    short: 'Kue tradisional Banjar yang lembut, harum dan kaya rasa santan serta telur',
    desc: 'Kue tradisional Banjar yang lembut dan harum, dibuat dari adonan kaya telur dan santan dengan tekstur lembut di bagian dalam.',
    tags: ['Manis', 'Kue Tradisional', 'Khas Banjar'], badge: 'Favorit', style: 'new' },
  { slug: 'pais-patin', cat: 'ikan', name: 'Pais Patin', price: 30000, old: 35000, img: 'img/menu/10.jpg', rating: 4.9, reviews: 91, cal: 440, time: 18,
    short: 'Patin berbumbu rempah dan cabai, dimasak hingga bumbu meresap dan harum',
    desc: 'Ikan patin berbumbu rempah dan cabai yang dibungkus daun lalu dimasak hingga bumbu meresap dan aromanya semakin harum.',
    tags: ['Ikan', 'Rempah', 'Khas Banjar'], badge: 'Pilihan', style: 'hot' },
];

const TRENDING = [
  ['soto banjar', 50], ['nasi kuning banjar', 45], ['ikan patin baubar', 40],
  ['ayam masak habang', 35], ['iwak karing betanak', 30], ['gangan asam banjar', 25],
];

function seed(db) {
  const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  if (!catCount) {
    const ins = db.prepare('INSERT INTO categories (slug,name,image,sort) VALUES (?,?,?,?)');
    CATEGORIES.forEach((c, i) => ins.run(c.slug, c.name, c.image, i));
  }

  const menuCount = db.prepare('SELECT COUNT(*) c FROM menu_items').get().c;
  if (!menuCount) {
    const catId = Object.fromEntries(db.prepare('SELECT slug,id FROM categories').all().map((r) => [r.slug, r.id]));
    const ins = db.prepare(`INSERT INTO menu_items
      (slug,category_id,name,short_desc,description,price,old_price,image,rating,review_count,calories,prep_minutes,tags,badge,badge_style,sort)
      VALUES (@slug,@category_id,@name,@short,@desc,@price,@old,@img,@rating,@reviews,@cal,@time,@tags,@badge,@style,@sort)`);
    MENU.forEach((m, i) => ins.run({ ...m, category_id: catId[m.cat], tags: JSON.stringify(m.tags), sort: i }));
  }

  const promoCount = db.prepare('SELECT COUNT(*) c FROM promos').get().c;
  if (!promoCount) {
    db.prepare(`INSERT INTO promos (code,title,description,percent,max_discount,min_order,is_daily,is_featured)
      VALUES ('WARBAN30','Diskon 30% Hidangan Khas Banjar','Diskon 30% untuk hidangan khas Banjar, berlaku hari ini.',30,30000,20000,1,1)`).run();
  }

  const trendCount = db.prepare('SELECT COUNT(*) c FROM search_logs').get().c;
  if (!trendCount) {
    const ins = db.prepare('INSERT INTO search_logs (term,hits) VALUES (?,?)');
    TRENDING.forEach(([t, h]) => ins.run(t, h));
  }
}

module.exports = { seed, MENU, CATEGORIES };

if (require.main === module) {
  const config = require('./config');
  const { openDb } = require('./db');
  const db = openDb(config.dbPath);
  seed(db);
  console.log('Seed selesai ->', config.dbPath);
}
