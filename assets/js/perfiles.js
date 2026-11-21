(function () {
  'use strict';

  const CLAVE = 'jota_perfiles_v1';
  const VIDA_MS = 5 * 60 * 1000;
  const MAX = 400;

  const ahora = () => Date.now();

  function leerCache() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      const c = crudo ? JSON.parse(crudo) : null;
      return (c && typeof c === 'object') ? c : {};
    } catch (_) { return {}; }
  }

  function escribirCache(c) {
    try {
      const claves = Object.keys(c);
      if (claves.length > MAX) {
        claves.sort((a, b) => (c[a].t || 0) - (c[b].t || 0));
        for (const k of claves.slice(0, claves.length - MAX)) delete c[k];
      }
      localStorage.setItem(CLAVE, JSON.stringify(c));
    } catch (_) {  }
  }

  function delCache(uids) {
    const c = leerCache(), t = ahora(), fresco = {}, faltan = [];
    for (const uid of uids) {
      const e = c[uid];
      if (e && (t - (e.t || 0)) < VIDA_MS) fresco[uid] = e.v;
      else faltan.push(uid);
    }
    return { fresco, faltan };
  }

  function guardar(uid, valor) {
    if (!uid) return;
    const c = leerCache();
    c[uid] = { t: ahora(), v: valor || null };
    escribirCache(c);
  }

  function guardarVarios(mapa) {
    const c = leerCache(), t = ahora();
    for (const uid of Object.keys(mapa)) c[uid] = { t: t, v: mapa[uid] };
    escribirCache(c);
  }

  async function traerVarios(uids, traer) {
    const unicos = [...new Set((uids || []).filter(Boolean))];
    const { fresco, faltan } = delCache(unicos);
    if (!faltan.length) return fresco;

    const nuevos = {};
    const resultados = await Promise.all(faltan.map(uid =>
      Promise.resolve()
        .then(() => traer(uid))
        .then(v => [uid, v || null])
        .catch(() => [uid, undefined])
    ));
    for (const [uid, v] of resultados) {
      if (v === undefined) continue;
      nuevos[uid] = v;
      fresco[uid] = v;
    }
    guardarVarios(nuevos);
    return fresco;
  }

  function aplicar(participantes, tarjetas) {
    for (const p of (participantes || [])) {
      const t = tarjetas[p.uid];
      if (!t) continue;
      if (t.avatar) p.avatar = t.avatar;
      if (t.equipado) p.equipado = t.equipado;
    }
    return participantes;
  }

  window.JotaPerfiles = { traerVarios, aplicar, guardar, VIDA_MS, CLAVE };
})();
