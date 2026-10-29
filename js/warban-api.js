/*!
 * warban-api.js — penghubung frontend Warban <-> backend API.
 * Cara pakai: tambahkan SEBELUM </body> di index.html (setelah script lain):
 *     <script src="js/warban-api.js"></script>
 * Bila frontend dan backend beda origin (mis. Live Server :5500), set dulu:
 *     <script>window.WARBAN_API_BASE = 'http://localhost:3000';</script>
 */
(function () {
  'use strict';

  /* ======================= Konfigurasi & util ======================= */
  var script = document.currentScript;
  /**
   * Tentukan alamat API:
   *  1) window.WARBAN_API_BASE / atribut data-api-base bila di-set
   *  2) origin yang sama (backend menyajikan frontend) -> cek /api/health
   *  3) fallback http://localhost:3000 (Live Server / file://)
   */
  var BASE = '';
  var baseReady = (function () {
    var explicit = window.WARBAN_API_BASE || (script && script.getAttribute('data-api-base'));
    if (explicit) { BASE = String(explicit).replace(/\/$/, ''); return Promise.resolve(); }
    var local = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (location.protocol === 'file:') { BASE = 'http://localhost:3000'; return Promise.resolve(); }
    return fetch('/api/health', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || j.ok !== true) throw new Error('bukan API'); })
      .catch(function () { if (local) BASE = 'http://localhost:3000'; });
  })();

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rupiah = function (n) { return 'Rp' + Number(n).toLocaleString('id-ID'); };
  var norm = function (s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); };

  /** "09:00 AM" / "01:00 PM" / "13:00" -> "HH:MM" (24 jam), null bila tidak cocok */
  function to24(text) {
    var m = String(text || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    var hh = +m[1];
    if (m[3]) { var pm = /pm/i.test(m[3]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
    return ('0' + hh).slice(-2) + ':' + m[2];
  }

  function store(key, val) {
    try {
      if (val === undefined) { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* storage dinonaktifkan */ }
    return null;
  }

  /** Buat elemen DOM aman (tanpa innerHTML => bebas XSS) */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { Accept: 'application/json' } };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return baseReady.then(function () {
      return fetch(BASE + '/api' + path, init).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var err = new Error(data.message || 'Terjadi kesalahan (' + res.status + ').');
            err.status = res.status; err.code = data.error; err.fields = data.fields || {};
            throw err;
          }
          return data;
        });
      }, function () {
        throw new Error('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
      });
    });
  }

  /* ======================= Gaya & toast ======================= */
  var css = [
    '.wb-toast-wrap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100050;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:92vw}',
    '.wb-toast{background:#222;color:#fff;padding:11px 18px;border-radius:10px;font:500 .9rem/1.4 Poppins,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);animation:wbIn .25s ease;pointer-events:auto}',
    '.wb-toast.ok{background:#1e8e4e}.wb-toast.err{background:#c0392b}',
    '@keyframes wbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '.wb-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100040;display:none;align-items:flex-end;justify-content:center}',
    '.wb-ov.open{display:flex}',
    '.wb-box{background:#fff;color:#222;width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:22px;font-family:Poppins,sans-serif;position:relative}',
    '@media(min-width:600px){.wb-ov{align-items:center}.wb-box{border-radius:18px}}',
    '.wb-box h3{margin:0 0 14px;font-size:1.2rem;font-weight:700}',
    '.wb-x{position:absolute;top:12px;right:14px;border:0;background:none;font-size:1.6rem;line-height:1;cursor:pointer;color:#888}',
    '.wb-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #eee}',
    '.wb-row img{width:52px;height:52px;border-radius:10px;object-fit:cover}.wb-row .n{flex:1;min-width:0}',
    '.wb-row .n div:first-child{font-weight:600;font-size:.92rem}.wb-row .n div:last-child{font-size:.8rem;color:#888}',
    '.wb-q{display:flex;align-items:center;gap:6px}.wb-q button{width:26px;height:26px;border-radius:50%;border:1px solid #ddd;background:#fff;cursor:pointer}',
    '.wb-sum{margin:14px 0;font-size:.9rem}.wb-sum div{display:flex;justify-content:space-between;padding:3px 0}.wb-sum .t{font-weight:700;font-size:1.05rem;border-top:1px dashed #ccc;margin-top:6px;padding-top:8px}',
    '.wb-f{display:flex;flex-direction:column;gap:10px;margin-top:10px}',
    '.wb-promo{display:flex;gap:8px}.wb-promo input{flex:1;padding:9px 12px;border:1px solid #ddd;border-radius:10px;text-transform:uppercase;font:400 .88rem Poppins,sans-serif}',
    '.wb-btn{border:0;border-radius:50px;padding:12px 22px;background:var(--primary,#c0392b);color:#fff;font:600 .92rem Poppins,sans-serif;cursor:pointer;text-align:center;text-decoration:none;display:inline-block}',
    '.wb-btn.alt{background:#eee;color:#333}.wb-btn[disabled]{opacity:.6;cursor:wait}',
    '.wb-msg{font-size:.8rem;margin-top:4px}.wb-msg.ok{color:#1e8e4e}.wb-msg.err{color:#c0392b}',
    '.wb-ok{text-align:center;padding:10px 0}.wb-ok .code{font:700 1.4rem monospace;letter-spacing:1px;background:#f6f6f6;border-radius:10px;padding:10px;margin:12px 0}',
    '#wbSearchRes{margin-top:18px;display:flex;flex-direction:column;gap:8px;text-align:left}',
    '#wbSearchRes .it{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);cursor:pointer;transition:.3s}',
    '#wbSearchRes .it:hover{background:var(--primary,#e8281a);border-color:var(--primary,#e8281a)}#wbSearchRes img{width:46px;height:46px;border-radius:50%;object-fit:cover}',
    '#wbSearchRes .nm{font-weight:600;font-size:.92rem;color:#fff}#wbSearchRes .pr{font-size:.78rem;color:rgba(255,255,255,.6)}#wbSearchRes .empty{padding:10px;color:rgba(255,255,255,.55);font-size:.9rem;text-align:center}',
    '.wb-soldout .madd{opacity:.4;pointer-events:none}.wb-soldout .mimg{filter:grayscale(1)}',
    '.wb-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}'
  ].join('\n');
  document.head.appendChild(h('style', { text: css }));

  var toastWrap = h('div', { class: 'wb-toast-wrap' });
  document.body.appendChild(toastWrap);
  function toast(msg, type, ms) {
    var t = h('div', { class: 'wb-toast ' + (type || ''), text: msg });
    toastWrap.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 3800);
  }

  /* ======================= Data menu & info ======================= */
  var menu = [];          // semua menu dari API
  var info = { delivery_fee: 0, free_delivery_min: 0, min_order: 0 };
  var menuReady = api('/menu').then(function (d) { menu = d.items; return menu; }).catch(function () { menu = []; });
  api('/info').then(function (d) { info = d; renderCart(); }).catch(function () {});

  function findMenuByName(name) {
    var n = norm(name);
    for (var i = 0; i < menu.length; i++) if (norm(menu[i].name) === n) return menu[i];
    return null;
  }

  /** Samakan harga/ketersediaan di kartu menu HTML dengan data server */
  // main.js membaca data-reviews, sedangkan HTML memakai data-ulasan -> popup menampilkan "(null reviews)"
  $$('.mcard').forEach(function (c) { if (!c.getAttribute('data-reviews')) c.setAttribute('data-reviews', c.getAttribute('data-ulasan') || '0'); });

  // Bungkus openMenuPop (fungsi global di main.js) untuk menerjemahkan label popup ke Bahasa Indonesia
  if (typeof window.openMenuPop === 'function') {
    var origOpenPop = window.openMenuPop;
    window.openMenuPop = function () {
      origOpenPop.apply(this, arguments);
      var add = $('#mpAddCart'); if (add) add.innerHTML = '<i class="fas fa-shopping-cart"></i> Tambah Pesanan';
      var meta = $('#mpMeta');
      if (meta) meta.innerHTML = meta.innerHTML.replace('Calories', 'Kalori').replace('Prep Time', 'Waktu Masak').replace(' min</div>', ' menit</div>');
      var st = $('#mpStars'); if (st) st.innerHTML = st.innerHTML.replace('reviews)', 'ulasan)');
    };
  }

  function syncMenuCards() {
    $$('.mcard').forEach(function (card) {
      var it = findMenuByName(card.getAttribute('data-title'));
      var wrap = card.closest('.mwrap') || card;
      if (!it) { return; }
      card.setAttribute('data-price', rupiah(it.price));
      card.setAttribute('data-reviews', it.review_count); card.setAttribute('data-rating', it.rating);
      if (it.old_price) card.setAttribute('data-old', rupiah(it.old_price));
      var pr = $('.mprice', card);
      if (pr) {
        if (pr.firstChild && pr.firstChild.nodeType === 3) pr.firstChild.nodeValue = rupiah(it.price) + ' ';
        var sm = $('small', pr); if (sm) sm.textContent = it.old_price ? rupiah(it.old_price) : '';
      }
      wrap.classList.toggle('wb-soldout', !it.is_available);
    });
  }
  function syncCategoryCounts() {
    api('/categories').then(function (d) {
      $$('.catcard[data-filter]').forEach(function (c) {
        var f = c.getAttribute('data-filter'), n = null;
        if (f === 'all') n = d.total_items;
        else d.categories.forEach(function (k) { if (k.slug === f) n = k.item_count; });
        var el = $('.catct', c); if (el && n !== null) el.textContent = n + ' menu';
      });
    }).catch(function () {});
  }
  menuReady.then(function () { syncMenuCards(); syncCategoryCounts(); });

  /* ======================= Keranjang ======================= */
  var CART_KEY = 'warban_cart', PROMO_KEY = 'warban_promo';
  var cart = store(CART_KEY) || [];
  var promoState = { code: store(PROMO_KEY) || '', discount: 0, msg: '', ok: false };
  var saveCart = function () { store(CART_KEY, cart); };
  var subtotal = function () { return cart.reduce(function (a, i) { return a + i.price * i.qty; }, 0); };
  var count = function () { return cart.reduce(function (a, i) { return a + i.qty; }, 0); };

  function addToCart(item, qty) {
    var found = cart.filter(function (c) { return c.id === item.id; })[0];
    if (found) found.qty = Math.min(20, found.qty + qty);
    else cart.push({ id: item.id, slug: item.slug, name: item.name, price: item.price, image: item.image, qty: Math.min(20, qty) });
    saveCart(); renderCart(); revalidatePromo();
  }

  var fab = h('div', { class: 'cartfl', role: 'button', tabindex: '0', 'aria-label': 'Buka keranjang',
    onclick: function () { openCart(); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCart(); } } });
  document.body.appendChild(fab);

  var ov = h('div', { class: 'wb-ov', onclick: function (e) { if (e.target === ov) closeCart(); } });
  var box = h('div', { class: 'wb-box', role: 'dialog', 'aria-modal': 'true' });
  ov.appendChild(box); document.body.appendChild(ov);
  var openCart = function () { view = cart.length ? 'cart' : view; ov.classList.add('open'); document.body.style.overflow = 'hidden'; renderCart(); };
  var closeCart = function () { ov.classList.remove('open'); document.body.style.overflow = ''; };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCart(); });

  var view = 'cart'; // 'cart' | 'done'
  var lastOrder = null;
  var submitting = false;

  function feeNow() {
    var type = ($('#wbType') || {}).value || 'delivery';
    if (type !== 'delivery') return 0;
    return (info.free_delivery_min > 0 && subtotal() >= info.free_delivery_min) ? 0 : info.delivery_fee;
  }

  function revalidatePromo() {
    if (!promoState.code) return;
    if (!subtotal()) { promoState.discount = 0; return; }
    api('/promo/validate?code=' + encodeURIComponent(promoState.code) + '&subtotal=' + subtotal())
      .then(function (d) { promoState.ok = true; promoState.discount = d.discount; promoState.msg = 'Promo ' + promoState.code + ' dipakai: -' + rupiah(d.discount); })
      .catch(function (e) { promoState.ok = false; promoState.discount = 0; promoState.msg = e.message; })
      .then(function () { if (ov.classList.contains('open')) renderCart(); });
  }

  function renderCart() {
    var n = count();
    fab.textContent = '';
    fab.appendChild(h('i', { class: 'fas fa-shopping-cart' })); fab.appendChild(h('span', { text: 'Keranjang' }));
    fab.appendChild(h('div', { class: 'ccount', text: String(n) }));
    if (!ov.classList.contains('open')) return;

    box.textContent = '';
    box.appendChild(h('button', { class: 'wb-x', 'aria-label': 'Tutup', text: '×', onclick: closeCart }));

    if (view === 'done' && lastOrder) return renderDone();

    box.appendChild(h('h3', { text: 'Pesanan Anda' }));
    if (!cart.length) { box.appendChild(h('p', { text: 'Keranjang masih kosong. Pilih menu favorit Anda dulu ya!' })); return; }

    cart.forEach(function (it, idx) {
      box.appendChild(h('div', { class: 'wb-row' },
        it.image ? h('img', { src: it.image, alt: '' }) : null,
        h('div', { class: 'n' }, h('div', { text: it.name }), h('div', { text: rupiah(it.price) + ' × ' + it.qty + ' = ' + rupiah(it.price * it.qty) })),
        h('div', { class: 'wb-q' },
          h('button', { type: 'button', text: '−', 'aria-label': 'Kurangi', onclick: function () { it.qty--; if (it.qty < 1) cart.splice(idx, 1); saveCart(); renderCart(); revalidatePromo(); } }),
          h('span', { text: String(it.qty) }),
          h('button', { type: 'button', text: '+', 'aria-label': 'Tambah', onclick: function () { it.qty = Math.min(20, it.qty + 1); saveCart(); renderCart(); revalidatePromo(); } }))));
    });

    var promoIn = h('input', { class: 'fctrl', id: 'wbPromo', placeholder: 'Kode promo (opsional)', maxlength: '30', value: promoState.code });
    box.appendChild(h('div', { class: 'wb-promo', style: 'margin-top:12px' }, promoIn,
      h('button', { type: 'button', class: 'wb-btn alt', text: 'Pakai', onclick: function () {
        promoState.code = promoIn.value.trim().toUpperCase(); store(PROMO_KEY, promoState.code || null);
        if (!promoState.code) { promoState.discount = 0; promoState.msg = ''; return renderCart(); }
        revalidatePromo();
      } })));
    if (promoState.msg) box.appendChild(h('div', { class: 'wb-msg ' + (promoState.ok ? 'ok' : 'err'), text: promoState.msg }));

    var fee = feeNow();
    var total = subtotal() - (promoState.ok ? promoState.discount : 0) + fee;
    var sum = h('div', { class: 'wb-sum' },
      h('div', null, h('span', { text: 'Subtotal' }), h('span', { text: rupiah(subtotal()) })),
      promoState.ok && promoState.discount ? h('div', null, h('span', { text: 'Diskon' }), h('span', { text: '-' + rupiah(promoState.discount) })) : null,
      h('div', null, h('span', { text: 'Ongkos kirim' }), h('span', { text: fee ? rupiah(fee) : 'Gratis' })),
      h('div', { class: 't' }, h('span', { text: 'Total' }), h('span', { id: 'wbTotal', text: rupiah(total) })));
    box.appendChild(sum);

    var cust = store('warban_customer') || {};
    var typeSel = h('select', { class: 'fctrl', id: 'wbType', onchange: function () { addrBox.style.display = this.value === 'delivery' ? '' : 'none'; renderTotalOnly(); } },
      h('option', { value: 'delivery', text: 'Diantar ke alamat' }), h('option', { value: 'pickup', text: 'Ambil sendiri di warung' }));
    var addr = h('textarea', { class: 'fctrl', id: 'wbAddr', rows: '2', placeholder: 'Alamat lengkap pengantaran', maxlength: '300' });
    addr.value = cust.address || '';
    var addrBox = h('div', { class: 'wb-f', style: 'margin:0' }, h('label', { class: 'flbl', text: 'Alamat pengantaran' }), addr);
    var name = h('input', { class: 'fctrl', id: 'wbName', placeholder: 'Nama lengkap', maxlength: '80', autocomplete: 'name' }); name.value = cust.name || '';
    var phone = h('input', { class: 'fctrl', id: 'wbPhone', placeholder: '08xxxxxxxxxx', type: 'tel', maxlength: '20', autocomplete: 'tel' }); phone.value = cust.phone || '';
    var notes = h('textarea', { class: 'fctrl', id: 'wbNotes', rows: '2', placeholder: 'Catatan (mis. tidak pedas)', maxlength: '300' });
    var pay = h('select', { class: 'fctrl', id: 'wbPay' }, h('option', { value: 'cod', text: 'Bayar di tempat (COD/tunai)' }), h('option', { value: 'transfer', text: 'Transfer bank' }), h('option', { value: 'qris', text: 'QRIS' }));
    var hp = h('input', { class: 'wb-hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var err = h('div', { class: 'wb-msg err', id: 'wbErr' });
    var submit = h('button', { type: 'submit', class: 'btn-red w-100 justify-content-center', text: 'Kirim Pesanan' });

    var form = h('form', { class: 'wb-f', novalidate: true, onsubmit: function (e) {
      e.preventDefault(); if (submitting) return;
      err.textContent = '';
      var type = typeSel.value;
      var body = {
        customer_name: name.value.trim(), phone: phone.value.trim(), order_type: type,
        address: type === 'delivery' ? addr.value.trim() : '', notes: notes.value.trim(), payment_method: pay.value,
        promo_code: promoState.ok ? promoState.code : '', website: hp.value,
        items: cart.map(function (c) { return { menu_id: c.slug, qty: c.qty }; })
      };
      submitting = true; submit.disabled = true; submit.textContent = 'Mengirim…';
      api('/orders', { method: 'POST', body: body }).then(function (d) {
        store('warban_customer', { name: body.customer_name, phone: body.phone, address: addr.value.trim() });
        lastOrder = d; cart = []; saveCart(); promoState = { code: '', discount: 0, msg: '', ok: false }; store(PROMO_KEY, null);
        view = 'done'; renderCart();
      }).catch(function (e2) { err.textContent = e2.message; })
        .then(function () { submitting = false; submit.disabled = false; submit.textContent = 'Kirim Pesanan'; });
    } },
      h('label', { class: 'flbl', text: 'Nama' }), name, h('label', { class: 'flbl', text: 'No. WhatsApp' }), phone,
      h('label', { class: 'flbl', text: 'Jenis pesanan' }), typeSel, addrBox,
      h('label', { class: 'flbl', text: 'Pembayaran' }), pay, h('label', { class: 'flbl', text: 'Catatan' }), notes, hp, err, submit);
    box.appendChild(form);

    function renderTotalOnly() {
      var f2 = feeNow(); var tt = subtotal() - (promoState.ok ? promoState.discount : 0) + f2;
      var t = $('#wbTotal'); if (t) t.textContent = rupiah(tt);
      var rows = $$('.wb-sum div'); if (rows[rows.length - 2]) rows[rows.length - 2].lastChild.textContent = f2 ? rupiah(f2) : 'Gratis';
    }
  }

  function renderDone() {
    var o = lastOrder.order;
    box.appendChild(h('div', { class: 'wb-ok' },
      h('div', { style: 'font-size:2.4rem', text: '✅' }),
      h('h3', { text: 'Pesanan Diterima!' }),
      h('div', { text: 'Kode pesanan Anda:' }),
      h('div', { class: 'code', text: o.code }),
      o.total != null ? h('div', { text: 'Total: ' + rupiah(o.total) }) : null,
      h('p', { style: 'font-size:.88rem;color:#666;margin:12px 0', text: 'Simpan kode ini. Konfirmasi pesanan lewat WhatsApp agar lebih cepat diproses.' }),
      lastOrder.whatsapp_url ? h('a', { class: 'btn-red', href: lastOrder.whatsapp_url, target: '_blank', rel: 'noopener', text: 'Konfirmasi via WhatsApp' }) : null,
      h('div', { style: 'margin-top:12px' }, h('button', { type: 'button', class: 'wb-btn alt', text: 'Tutup', onclick: function () { view = 'cart'; closeCart(); renderCart(); } }))));
  }

  renderCart();

  /* Tombol "Tambah Pesanan" (#mpAddCart).
   * Handler lama di main.js membaca #cartCount yang sudah dikomentari di HTML -> TypeError.
   * Klik ditangkap lebih dulu (fase capture) dan alurnya (umpan balik + tutup popup) dijalankan di sini. */
  var adding = false;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#mpAddCart');
    if (!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (adding) return;
    var title = ($('#mpTitle') || {}).textContent;
    var qty = parseInt(($('#mpQnum') || {}).textContent, 10) || 1;
    menuReady.then(function () {
      var it = findMenuByName(title);
      if (!it) return toast('Menu belum tersedia. Muat ulang halaman lalu coba lagi.', 'err');
      if (!it.is_available) return toast(it.name + ' sedang habis.', 'err');
      adding = true;
      addToCart(it, qty);
      toast(qty + '× ' + it.name + ' masuk keranjang', 'ok');
      btn.innerHTML = '<i class="fas fa-check"></i> Ditambahkan!';
      btn.style.background = 'linear-gradient(135deg,var(--green),#1a4a35)';
      setTimeout(function () {
        if (typeof window.closeMenuPop === 'function') window.closeMenuPop(); else { var c = $('#mpClose'); if (c) c.click(); }
        btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Tambah Pesanan';
        btn.style.background = '';
        adding = false;
      }, 900);
    });
  }, true);

  /* ======================= Pencarian ======================= */
  var searchInput = $('#searchInput');
  var cardByName = function (name) { return $$('.mcard').filter(function (c) { return norm(c.getAttribute('data-title')) === norm(name); })[0]; };
  function closeSearchOv() {
    if (typeof window.closeSearch === 'function') window.closeSearch();
    else { var c = $('#searchClose'); if (c) c.click(); }
  }
  /** Tutup overlay, pastikan filter menu = semua, scroll ke kartu lalu (opsional) buka popup detail */
  function showMenuItem(name, openPopup) {
    closeSearchOv();
    if (typeof window.filterMenu === 'function') window.filterMenu('all');
    var card = cardByName(name);
    var target = card ? (card.closest('.mwrap') || card) : $('#menu');
    setTimeout(function () {
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var add = card && $('.madd', card);
      if (openPopup && add) setTimeout(function () { add.click(); }, 500);
    }, 350);
  }

  // Chip di overlay (.sovcat) memakai data-cat sisa template (burgers/pizza/...) sehingga filter lama
  // menyembunyikan SEMUA menu. Chip "Semua Menu" -> tampilkan semua; chip lain = nama hidangan -> buka hidangannya.
  document.addEventListener('click', function (e) {
    var chip = e.target.closest && e.target.closest('.sovcat');
    if (!chip) return;
    e.stopImmediatePropagation();
    $$('.sovcat').forEach(function (b) { b.classList.remove('active'); });
    chip.classList.add('active');
    if (chip.getAttribute('data-cat') === 'all') {
      closeSearchOv();
      setTimeout(function () {
        if (typeof window.filterMenu === 'function') window.filterMenu('all');
        var m = $('#menu'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } else showMenuItem(chip.textContent, true);
  }, true);

  if (searchInput) {
    var resBox = h('div', { id: 'wbSearchRes' });
    var holder = searchInput.closest('.sovinput');
    if (holder && holder.parentNode) holder.parentNode.insertBefore(resBox, holder.nextSibling);
    var timer, lastItems = [];

    var runSearch = function () {
      var q = searchInput.value.trim();
      resBox.textContent = ''; lastItems = [];
      if (q.length < 2) return Promise.resolve([]);
      return api('/menu?q=' + encodeURIComponent(q) + '&limit=6&log=' + (q.length >= 3 ? 1 : 0)).then(function (d) {
        if (searchInput.value.trim() !== q) return []; // hasil basi
        lastItems = d.items;
        if (!d.items.length) resBox.appendChild(h('div', { class: 'empty', text: 'Tidak ada menu untuk "' + q + '".' }));
        d.items.forEach(function (it) {
          resBox.appendChild(h('div', { class: 'it', role: 'button', tabindex: '0',
            onclick: function () { showMenuItem(it.name, true); },
            onkeydown: function (e) { if (e.key === 'Enter') showMenuItem(it.name, true); } },
            h('img', { src: it.image || '', alt: '' }),
            h('div', null, h('div', { class: 'nm', text: it.name }), h('div', { class: 'pr', text: it.category.name + ' • ' + rupiah(it.price) }))));
        });
        return d.items;
      }).catch(function () { return []; });
    };
    var goFirst = function () {
      clearTimeout(timer);
      runSearch().then(function (items) { if (items[0]) showMenuItem(items[0].name, true); });
    };
    searchInput.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runSearch, 300); });
    searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goFirst(); } });
    var sbtn = $('.sovinput button'); if (sbtn) sbtn.addEventListener('click', goFirst);

    // "Paling banyak dicari" dari data server; klik tag = cari
    api('/search/trending?limit=6').then(function (d) {
      var tags = $$('.sovtrend .ttag');
      d.terms.forEach(function (t, i) {
        if (tags[i]) tags[i].textContent = t.term.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      });
    }).catch(function () {});
    $$('.sovtrend .ttag').forEach(function (t) { t.addEventListener('click', function () { setTimeout(runSearch, 0); }); });
  }

  /* ======================= Promo & countdown ======================= */
  var promoInfo = null, cdEls = null, cdTimer = null;
  // Sembunyikan <span id="cdH/cdM/cdS"> lama dan tampilkan salinan ber-id baru di sampingnya.
  // Countdown palsu di main.js tetap menulis ke elemen lama (tak terlihat, tanpa error),
  // sehingga angka dari server tidak tertimpa.
  function takeOver(id, newId) {
    var el = document.getElementById(id);
    if (!el) return null;
    var c = el.cloneNode(true); c.id = newId;
    el.parentNode.insertBefore(c, el);
    el.style.display = 'none'; el.setAttribute('aria-hidden', 'true');
    return c;
  }
  function startCountdown() {
    if (!promoInfo || !promoInfo.ends_at) return;
    if (!cdEls) cdEls = [takeOver('cdH', 'wbCdH'), takeOver('cdM', 'wbCdM'), takeOver('cdS', 'wbCdS')];
    if (!cdEls[0] || !cdEls[1] || !cdEls[2]) return;
    var end = new Date(promoInfo.ends_at).getTime();
    // selisih jam perangkat vs server
    var skew = Date.now() - (end - promoInfo.seconds_left * 1000);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    clearInterval(cdTimer);
    var tick = function () {
      var left = Math.max(0, Math.floor((end - Date.now() + skew) / 1000));
      cdEls[0].textContent = pad(Math.floor(left / 3600));
      cdEls[1].textContent = pad(Math.floor((left % 3600) / 60));
      cdEls[2].textContent = pad(left % 60);
      if (left === 0) { clearInterval(cdTimer); setTimeout(loadPromo, 3000); }
    };
    tick(); cdTimer = setInterval(tick, 1000);
  }
  function loadPromo() {
    api('/promo').then(function (d) { promoInfo = d.active ? d.promo : null; startCountdown(); }).catch(function () {});
  }
  loadPromo();

  $$('#special a.btn-red').forEach(function (a) {
    a.addEventListener('click', function () {
      if (!promoInfo) return;
      promoState.code = promoInfo.code; store(PROMO_KEY, promoState.code); revalidatePromo();
      toast('Kode promo ' + promoInfo.code + ' disimpan. Pilih menu lalu cek keranjang!', 'ok', 4500);
    });
  });
  if (promoState.code) revalidatePromo();

  /* ======================= Form: reservasi, kontak, newsletter ======================= */
  // Form di index.html bukan <form>: field tanpa name, tombol type="button" (#resBtn, #ctcBtn, #nlBtn).
  // Field dicocokkan lewat teks <label class="flbl"> -> kontrol di sebelahnya.
  var LABELS = {
    name: /nama/i, phone: /telepon|telp/i, email: /surel|e-?mail/i, guests: /tamu/i,
    date: /^\s*(date|tanggal)/i, time: /^\s*(time|waktu|jam)/i, notes: /catatan/i,
    subject: /keperluan|subjek|topik/i, message: /^\s*pesan/i
  };
  var TYPE_FALLBACK = { email: 'input[type=email]', phone: 'input[type=tel]', date: 'input[type=date]', time: 'input[type=time]', message: 'textarea', notes: 'textarea' };
  var LABEL_ID = { name: 'Nama', phone: 'Nomor telepon', email: 'Email', date: 'Tanggal', time: 'Jam', guests: 'Jumlah tamu', message: 'Pesan', subject: 'Keperluan' };

  function labelField(container, key, used) {
    var labels = $$('label', container);
    for (var i = 0; i < labels.length; i++) {
      if (!LABELS[key].test(labels[i].textContent)) continue;
      var box = labels[i].parentElement;
      var ctl = box && box.querySelector('input,select,textarea');
      if (ctl && (!used || used.indexOf(ctl) < 0)) return ctl;
    }
    return null;
  }
  function findField(container, key, used) {
    var el = $('[name="' + key + '"]', container) || labelField(container, key, used);
    if (!el && TYPE_FALLBACK[key]) el = $$(TYPE_FALLBACK[key], container).filter(function (x) { return used.indexOf(x) < 0; })[0];
    return el || null;
  }

  function readField(key, el) {
    var text = el.tagName === 'SELECT' && el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : '';
    var v = (el.value || '').trim();
    if (key === 'guests') { var n = (text || v).match(/\d+/g); return n ? Math.max.apply(null, n.map(Number)) : ''; } // "3 - 4 Orang" -> 4
    if (key === 'time') return to24(text || v) || v;
    if (key === 'subject') return el.tagName === 'SELECT' ? (el.value ? text : '') : v;
    return v;
  }

  /**
   * cfg: { container, button, endpoint, label, fields:{kunci:wajib?}, okEl, success(data) }
   * Klik pada cfg.button ditangkap di fase capture sehingga handler lama (notifikasi palsu) tidak ikut jalan.
   */
  function bindAction(cfg) {
    var container = $(cfg.container);
    if (!container) return;
    var hp = h('input', { class: 'wb-hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    container.appendChild(hp);
    var busy = false;

    function run(btn) {
      if (busy) return;
      var used = [], body = {}, empty = [], notFound = [];
      Object.keys(cfg.fields).forEach(function (key) {
        var el = findField(container, key, used);
        if (!el) { if (cfg.fields[key]) notFound.push(key); return; }
        used.push(el);
        var v = readField(key, el);
        body[key] = v;
        if (cfg.fields[key] && (v === '' || v == null)) empty.push(LABEL_ID[key] || key);
      });
      if (notFound.length) {
        console.warn('[Warban] Form "' + cfg.label + '": field tidak ditemukan ->', notFound.join(', '));
        return toast('Form belum terhubung ke server (field: ' + notFound.join(', ') + ').', 'err', 6000);
      }
      if (empty.length) return toast('Mohon lengkapi: ' + empty.join(', ') + '.', 'err');
      body.website = hp.value;

      busy = true;
      var oldHtml = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...'; }
      api(cfg.endpoint, { method: 'POST', body: body }).then(function (d) {
        $$('input,select,textarea', container).forEach(function (el) {
          if (el === hp) return;
          if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
        });
        toast(cfg.success(d), 'ok', 6000);
        var ok = cfg.okEl && $(cfg.okEl);
        if (ok) {
          var pEl = $('p', ok); if (pEl && cfg.okText) pEl.textContent = cfg.okText(d);
          ok.style.display = 'block';
          ok.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(function () { ok.style.display = ''; }, 10000);
        }
        if (cfg.after) cfg.after();
      }).catch(function (er) { toast(er.message, 'err', 6500); })
        .then(function () { busy = false; if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; } });
    }

    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest(cfg.button);
      if (!b || !container.contains(b)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      run(b);
    }, true);
  }

  bindAction({ label: 'reservasi', container: '#reservation .fcard', button: '#resBtn', okEl: '#resOk', endpoint: '/reservations',
    fields: { name: true, phone: true, email: true, guests: true, date: true, time: true, notes: false },
    success: function (d) { return 'Reservasi diterima! Kode: ' + d.reservation.code + '. Kami konfirmasi lewat WhatsApp/telepon.'; },
    okText: function (d) { return 'Reservasi berhasil! Kode Anda: ' + d.reservation.code + '. Kami akan segera mengonfirmasi.'; },
    after: function () { refreshSlots(); } });

  bindAction({ label: 'kontak', container: '#contact-section .fcard', button: '#ctcBtn', okEl: '#ctcOk', endpoint: '/contact',
    fields: { name: true, email: true, phone: false, subject: true, message: true },
    success: function (d) { return d.message; } });

  bindAction({ label: 'newsletter', container: '#newsletter .nl-form-wrap', button: '#nlBtn', endpoint: '/newsletter',
    fields: { email: true }, success: function (d) { return d.message; } });

  /* Reservasi: tanggal minimal hari ini (WITA) + nonaktifkan jam yang penuh / di luar jam operasional */
  var resCard = $('#reservation .fcard');
  var dateEl = resCard && labelField(resCard, 'date');
  var timeEl = resCard && labelField(resCard, 'time');
  function refreshSlots() {
    if (!dateEl || !timeEl || !dateEl.value) return;
    var wanted = dateEl.value;
    api('/reservations/availability?date=' + encodeURIComponent(wanted)).then(function (d) {
      if (dateEl.value !== wanted) return;
      var map = {};
      d.slots.forEach(function (sl) { map[sl.time] = sl; });
      Array.prototype.forEach.call(timeEl.options, function (o) {
        if (!o.__t) o.__t = o.text;
        var sl = map[to24(o.__t)];
        var ok = !!(sl && sl.available);
        o.disabled = !ok;
        o.text = ok ? o.__t : o.__t + ' (tidak tersedia)';
      });
      var cur = timeEl.options[timeEl.selectedIndex];
      if (cur && cur.disabled) {
        for (var i = 0; i < timeEl.options.length; i++) if (!timeEl.options[i].disabled) { timeEl.selectedIndex = i; break; }
      }
    }).catch(function (e) { if (e.status === 400) toast(e.message, 'err'); });
  }
  if (dateEl) {
    dateEl.min = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // hari ini di WITA
    dateEl.addEventListener('change', refreshSlots);
  }

  /* ======================= Ulasan (opsional) ======================= */
  // Letakkan <div data-warban-reviews></div> di mana pun untuk menampilkan ulasan yang sudah disetujui.
  var revBox = $('[data-warban-reviews]');
  if (revBox) {
    api('/reviews?limit=6').then(function (d) {
      revBox.textContent = '';
      d.items.forEach(function (r) {
        revBox.appendChild(h('div', { class: 'wb-review', style: 'padding:12px 0;border-bottom:1px solid #eee' },
          h('div', { style: 'font-weight:600', text: r.name + '  ' + '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) }),
          h('p', { style: 'margin:4px 0 0', text: r.comment })));
      });
    }).catch(function () {});
  }

  /* ======================= Favorit (ikon hati, disimpan di browser) ======================= */
  var FAV_KEY = 'warban_fav';
  var favs = store(FAV_KEY) || [];
  function paintHeart(card) {
    var heart = $('.mhrt', card); if (!heart) return;
    var on = favs.indexOf(norm(card.getAttribute('data-title'))) >= 0;
    var ico = $('i', heart);
    ico.classList.toggle('fas', on); ico.classList.toggle('far', !on);
    heart.style.color = on ? 'var(--primary)' : '#ccc';
  }
  $$('.mcard').forEach(paintHeart);
  document.addEventListener('click', function (e) {
    var heart = e.target.closest && e.target.closest('.mhrt');
    if (!heart) return;
    var card = heart.closest('.mcard'); if (!card) return;
    setTimeout(function () { // setelah handler main.js men-toggle ikon
      var key = norm(card.getAttribute('data-title'));
      favs = favs.filter(function (x) { return x !== key; });
      if ($('i', heart).classList.contains('fas')) favs.push(key);
      store(FAV_KEY, favs);
    }, 0);
  }, true);

  /* ======================= API publik ======================= */
  window.Warban = { api: api, to24: to24, cart: { add: addToCart, open: openCart, items: function () { return cart.slice(); } }, toast: toast };
})();
