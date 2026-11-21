(function () {
  'use strict';

  const TOPE_NOMBRE = 120;
  const TOPE_FOTO = 500;

  function nombreDe(user) {
    const n = (user && (user.displayName || (user.email ? user.email.split('@')[0] : ''))) || 'Cliente';
    return String(n).slice(0, TOPE_NOMBRE);
  }

  function fotoDe(user) {
    const f = String((user && user.photoURL) || '');
    return /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[A-Za-z0-9_.\/=%~+-]*$/.test(f) && f.length <= TOPE_FOTO ? f : '';
  }

  function fichaNueva(user, ahora, extra) {
    return Object.assign({
      uid: user.uid,
      email: user.email,
      name: nombreDe(user),
      photo_url: fotoDe(user),
      avatar: (window.JotaAvatar ? window.JotaAvatar.aleatorio() : 'a1'),
      equipado: { marco: null, banner: null, pin: null },
      pase: {},
      total_delivered_orders: 0,
      total_spent_usdt: 0,
      created_at: ahora,
      last_seen: ahora,
    }, extra || {});
  }

  function datosDeEntrada(user, ahora) {
    return { name: nombreDe(user), photo_url: fotoDe(user), last_seen: ahora };
  }

  window.JotaCuenta = { fichaNueva: fichaNueva, datosDeEntrada: datosDeEntrada, fotoDe: fotoDe };
})();
