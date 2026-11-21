(function () {
  'use strict';

  const DATA_OK = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

  function srcSeguro(u) {
    const t = String(u == null ? '' : u).trim();
    if (/^https?:\/\/[^\s"'<>\\]+$/i.test(t)) return t;
    if (DATA_OK.test(t)) return t;
    return '';
  }

  function colorSeguro(c) {
    return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : '';
  }

  const limitar = (v, min, max, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };

  function ajuste(r) {
    const a = (r && r.prize_image_ajuste) || {};
    return { z: limitar(a.z, 0.4, 2.5, 1), x: limitar(a.x, -60, 60, 0), y: limitar(a.y, -60, 60, 0) };
  }

  function transformDe(a) {
    return 'translate(' + a.x + '%,' + a.y + '%) scale(' + a.z + ')';
  }

  function fondo(r) {
    const f = (r && r.prize_fondo) || {};
    if (f.tipo === 'color') return { tipo: 'color', color: colorSeguro(f.valor) };
    if (f.tipo === 'link') return { tipo: 'link', src: srcSeguro(f.valor) };
    if (f.tipo === 'archivo' && f.valor) return { tipo: 'archivo' };
    return { tipo: '' };
  }

  function aplicar(caja, o) {
    if (!caja) return null;
    const fondoSrc = srcSeguro(o.fondoSrc);
    const color = colorSeguro(o.color);
    caja.style.backgroundColor = color || '';
    caja.style.backgroundImage = fondoSrc ? 'url("' + fondoSrc + '")' : (color ? 'none' : '');
    caja.style.backgroundSize = fondoSrc ? 'cover' : '';
    caja.style.backgroundPosition = fondoSrc ? 'center' : '';
    caja.style.backgroundRepeat = fondoSrc ? 'no-repeat' : '';
    const src = srcSeguro(o.src);
    caja.innerHTML = '';
    if (!src) {
      caja.classList.remove('cargando');
      if (o.vacio) {
        const s = document.createElement('span');
        s.textContent = o.vacio;
        caja.appendChild(s);
      }
      return null;
    }
    const img = document.createElement('img');
    img.alt = o.alt || '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.style.transform = transformDe(o.ajuste || { z: 1, x: 0, y: 0 });
    const listo = () => caja.classList.remove('cargando');
    img.addEventListener('load', listo, { once: true });
    img.addEventListener('error', listo, { once: true });
    caja.classList.add('cargando');
    img.src = src;
    caja.appendChild(img);
    if (img.complete && img.naturalWidth) listo();
    return img;
  }

  function pintar(caja, r, leer, vacio) {
    if (!caja) return Promise.resolve();
    const f = fondo(r);
    const tieneImg = !!(r && (r.prize_image_archivo || r.prize_image_url));
    caja.dataset.arte = r && r.id ? r.id : '';
    if (tieneImg) { caja.classList.add('cargando'); caja.innerHTML = ''; }
    const pImg = r && r.prize_image_archivo ? leer(r.id, 'principal') : Promise.resolve(r ? r.prize_image_url : '');
    const pFondo = f.tipo === 'archivo' ? leer(r.id, 'fondo') : Promise.resolve(f.src || '');
    return Promise.all([pImg.catch(() => ''), pFondo.catch(() => '')]).then(([src, fondoSrc]) => {
      if (caja.dataset.arte !== (r && r.id ? r.id : '')) return;
      aplicar(caja, { src: src, fondoSrc: fondoSrc, color: f.color, ajuste: ajuste(r), alt: r ? r.prize_name : '', vacio: vacio });
    });
  }

  window.JotaPremio = {
    srcSeguro: srcSeguro, colorSeguro: colorSeguro, ajuste: ajuste, transformDe: transformDe,
    fondo: fondo, aplicar: aplicar, pintar: pintar,
  };
})();
