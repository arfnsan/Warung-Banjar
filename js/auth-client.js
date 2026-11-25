(function () {
  'use strict';
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const connectionMessage = local
    ? 'Server akun belum aktif. Jalankan npm.cmd start dari folder backend, lalu buka http://localhost:3000.'
    : 'Layanan akun tidak dapat dihubungi. Silakan coba lagi.';

  async function request(action, body) {
    let response;
    try {
      response = await fetch('/api/auth/' + action, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (_) {
      throw new Error(connectionMessage);
    }
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
      const error = new Error('Halaman ini tidak terhubung ke backend Warban. Buka halaman dari server aplikasi.');
      error.wrongServer = true;
      throw error;
    }
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || 'Permintaan gagal. Silakan coba lagi.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function openBackend() {
    location.replace('http://localhost:3000/login.html');
    return { redirecting: true };
  }

  // Periksa server tanpa mengirim username/password ke file:// atau Live Server.
  window.warbanAuthReady = location.protocol === 'file:'
    ? Promise.resolve(openBackend())
    : request('me').then(user => ({ user }), error => {
      if (error.status === 401) return { user: null };
      if (local && location.port !== '3000' && error.wrongServer) return openBackend();
      return { error };
    });

  window.warbanAuth = async function (action, body) {
    const state = await window.warbanAuthReady;
    if (state.redirecting) throw new Error('Membuka halaman login di server aplikasi...');
    // Coba kembali bila server sempat mati saat halaman pertama dimuat.
    return request(action, body);
  };
})();
