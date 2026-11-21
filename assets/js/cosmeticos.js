(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const escCss = (v) => String(v == null ? '' : v).replace(/"/g, '&quot;');

  const MARCOS = {
    m_bronce: {
      nombre: 'Bronce', nivel: 1,
      img: 'assets/img/cosmeticos/marcos/m_bronce.webp',
      css: 'conic-gradient(from 0deg,#4A2D14,#A9642B,#E0A263,#A9642B,#4A2D14)',
    },
    m_plata: {
      nombre: 'Plata', nivel: 4,
      img: 'assets/img/cosmeticos/marcos/m_plata.webp',
      css: 'conic-gradient(from 0deg,#4C5560,#9AA7B4,#E8EFF5,#9AA7B4,#4C5560)',
    },
    m_oro: {
      nombre: 'Oro', nivel: 13,
      img: 'assets/img/cosmeticos/marcos/m_oro.webp',
      css: 'conic-gradient(from 0deg,#8A6A12,#E8B93C,#FFD97A,#E8B93C,#8A6A12)',
    },
    m_oro_rojo: {
      nombre: 'Oro Rojo', nivel: 16,
      img: 'assets/img/cosmeticos/marcos/m_oro_rojo.webp',
      css: 'conic-gradient(from 0deg,#5E1608,#C4451C,#FFB347,#E8552B,#5E1608)',
    },
  };

  const BANNERS = {
    b_rezan:     { nombre: 'Rezan',     nivel: 3,  img: 'assets/img/cosmeticos/banners/b_rezan.webp',
                   css: 'linear-gradient(115deg,#101A12,#2C4A2E 50%,#101A12)' },
    b_farlow:    { nombre: 'Farlow',    nivel: 3,  img: 'assets/img/cosmeticos/banners/b_farlow.webp',
                   css: 'linear-gradient(115deg,#12161A,#3A4750 50%,#12161A)' },
    b_romanov:   { nombre: 'Romanov',   nivel: 7,  img: 'assets/img/cosmeticos/banners/b_romanov.webp',
                   css: 'linear-gradient(115deg,#1A1206,#6B4A12 50%,#1A1206)' },
    b_ksk:       { nombre: 'KSK',       nivel: 7,  img: 'assets/img/cosmeticos/banners/b_ksk.webp',
                   css: 'linear-gradient(115deg,#0B1622,#1E3A55 50%,#0B1622)' },
    b_ricksaw:   { nombre: 'Ricksaw',   nivel: 9,  img: 'assets/img/cosmeticos/banners/b_ricksaw.webp',
                   css: 'linear-gradient(115deg,#0C1218,#2A3742 50%,#0C1218)' },
    b_voltzmann: { nombre: 'Voltzmann', nivel: 9,  img: 'assets/img/cosmeticos/banners/b_voltzmann.webp',
                   css: 'linear-gradient(115deg,#08131F,#12507A 50%,#08131F)' },
    b_darryl:    { nombre: 'Bloody Darryl', nivel: 18, img: 'assets/img/cosmeticos/banners/b_darryl.webp',
                   css: 'linear-gradient(115deg,#1A0510,#7A1226 50%,#1A0510)' },
    b_vypa:      { nombre: 'Vypa',      nivel: 18, img: 'assets/img/cosmeticos/banners/b_vypa.webp',
                   css: 'linear-gradient(115deg,#07121C,#155A7A 50%,#07121C)' },
  };

  const PINES = {
    p_recluta_bronce: {
      nombre: 'Recluta Bronce', nivel: 2, color: '#C97F3F',
      img: 'assets/img/cosmeticos/pines/p_recluta_bronce.webp',
      svg: '<path d="M12 1.8 2.6 6v6.4c0 5.2 4 9.1 9.4 9.8 5.4-.7 9.4-4.6 9.4-9.8V6z"/>',
    },
    p_elite_hierro: {
      nombre: 'Elite de Hierro', nivel: 6, color: '#9AA7B4',
      img: 'assets/img/cosmeticos/pines/p_elite_hierro.webp',
      svg: '<path fill-rule="evenodd" d="M12 1.6 2.4 6.2v6.2c0 5 3.9 8.9 9.6 10 5.7-1.1 9.6-5 9.6-10V6.2zm0 4.6 1.9 4.1 4.4.5-3.3 3 .9 4.4L12 15.9l-3.9 2.3.9-4.4-3.3-3 4.4-.5z"/>',
    },
    p_guardia_acero: {
      nombre: 'Guardián de Acero', nivel: 11, color: '#6FE0FF',
      img: 'assets/img/cosmeticos/pines/p_guardia_acero.webp',
      svg: '<path fill-rule="evenodd" d="M12 1.4 2.2 6.1v6.3c0 5.1 4 9.2 9.8 10.2 5.8-1 9.8-5.1 9.8-10.2V6.1zm-4.6 6.9h9.2v2.5H7.4zm0 4.4h9.2v2.5H7.4z"/>',
    },
    p_tactico_supremo: {
      nombre: 'Táctico Supremo', nivel: 14, color: '#E8B93C',
      img: 'assets/img/cosmeticos/pines/p_tactico_supremo.webp',
      svg: '<path fill-rule="evenodd" d="M12 1.2 1.9 6.1v6.4c0 5.3 4.1 9.5 10.1 10.3 6-.8 10.1-5 10.1-10.3V6.1zM12 6.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2zm0 2.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z"/>',
    },
    p_campeon_global: {
      nombre: 'Campeón Global', nivel: 20, color: '#8E7BFF',
      img: 'assets/img/cosmeticos/pines/p_campeon_global.webp',
      svg: '<path fill-rule="evenodd" d="M12 1 1.7 6v6.5C1.7 18 6 22.3 12 23c6-.7 10.3-5 10.3-10.5V6zm0 3.6 2.3 4.8 5.2.7-3.8 3.6 1 5.2L12 16.4l-4.7 2.5 1-5.2-3.8-3.6 5.2-.7z"/>',
    },
  };

  const TIPOS = {
    marcos:  { lista: MARCOS,  campo: 'marco'  },
    banners: { lista: BANNERS, campo: 'banner' },
    pines:   { lista: PINES,   campo: 'pin'    },
  };

  const marco  = (id) => MARCOS[id]  || null;
  const banner = (id) => BANNERS[id] || null;
  const pin    = (id) => PINES[id]   || null;

  const ids = (tipo) => Object.keys((TIPOS[tipo] || {}).lista || {});

  function normalizar(equipado, desbloqueados) {
    const eq = equipado || {};
    const db = desbloqueados || {};
    const ok = (tipo, id) => {
      if (!id) return null;
      if (!TIPOS[tipo].lista[id]) return null;
      const mios = Array.isArray(db[tipo]) ? db[tipo] : [];
      return mios.indexOf(id) !== -1 ? id : null;
    };
    return {
      marco:  ok('marcos',  eq.marco),
      banner: ok('banners', eq.banner),
      pin:    ok('pines',   eq.pin),
    };
  }

  function tiene(desbloqueados, tipo, id) {
    const mios = (desbloqueados || {})[tipo];
    return Array.isArray(mios) && mios.indexOf(id) !== -1;
  }

  const vacio = () => ({ marcos: [], banners: [], pines: [] });

  function htmlAvatar(avatarId, nombre, marcoId, clase) {
    const foto = window.JotaAvatar
      ? JotaAvatar.html(avatarId, nombre, clase)
      : '<span class="jav ' + esc(clase || '') + '"></span>';
    const m = marco(marcoId);
    if (!m) return foto;
    return '<span class="jmarco' + (m.gira ? ' gira' : '') + '" style="--jm:' + escCss(m.css || 'none') + '">'
      + foto
      + (m.img ? '<img class="jmarco-ani" src="' + esc(m.img) + '" alt="" loading="lazy"'
               + ' decoding="async" onerror="this.remove()">' : '')
      + '</span>';
  }

  function fondoBanner(bannerId) {
    const b = banner(bannerId);
    if (!b) return '';
    return b.img ? "url('" + b.img + "') center/cover no-repeat" : b.css;
  }

  function fondoFila(bannerId, destacada) {
    return fondoBanner(bannerId);
  }

  function htmlPieza(bannerId) {
    const b = banner(bannerId);
    if (!b || !b.img) return '';
    return '<img class="jbanner-pieza" src="' + esc(b.img) + '" alt="" loading="lazy"'
         + ' decoding="async" onerror="this.remove()">';
  }

  function claseFila(bannerId, destacada) {
    if (!banner(bannerId)) return '';
    return 'jfila-banner' + (destacada ? ' jfila-propia' : '');
  }

  function htmlPin(pinId, px) {
    const p = pin(pinId);
    if (!p) return '';
    const lado = px || 26;
    let h = '<span class="jpin" style="color:' + p.color + ';width:' + lado + 'px;height:'
      + lado + 'px" title="' + esc(p.nombre) + '">';
    if (p.svg) {
      h += '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + p.svg + '</svg>';
    }
    if (p.img) {
      h += '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async"'
         + ' onerror="this.remove()">';
    }
    return h + '</span>';
  }

  function htmlVerificado(px) {
    const lado = px || 26;
    return '<span class="jverif" style="width:' + lado + 'px;height:' + lado + 'px" title="Vendedor verificado" role="img" aria-label="Vendedor verificado">'
      + '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true">'
      + '<path d="M50 3 95 26.5v47L50 97 5 73.5v-47z" fill="rgba(232,185,60,.16)" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>'
      + '<g transform="translate(29 29) scale(1.75)" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M12 2l7.5 3v6c0 4.8-3.1 8.6-7.5 10-4.4-1.4-7.5-5.2-7.5-10V5z"/><path d="M8.6 11.8l2.4 2.4 4.4-4.6"/></g></svg></span>';
  }

  function htmlMuestra(tipo, id) {
    if (tipo === 'marcos') {
      const m = marco(id); if (!m) return '';
      return '<span class="jmuestra jm-marco' + (m.gira ? ' gira' : '') + '" style="--jm:'
        + escCss(m.css || 'none') + '">'
        + (m.img ? '<img src="' + esc(m.img) + '" alt="" loading="lazy" onerror="this.remove()">' : '')
        + '</span>';
    }
    if (tipo === 'banners') {
      const b = banner(id); if (!b) return '';
      return '<span class="jmuestra jm-banner" style="background:' + escCss(fondoBanner(id)) + '"></span>';
    }
    if (tipo === 'pines') return '<span class="jmuestra jm-pin">' + htmlPin(id, 40) + '</span>';
    return '';
  }

  const nombreDe = (tipo, id) => ((TIPOS[tipo] || {}).lista || {})[id]
    ? TIPOS[tipo].lista[id].nombre : '';

  window.JotaCosmeticos = {
    MARCOS, BANNERS, PINES, TIPOS,
    marco, banner, pin, ids, nombreDe,
    normalizar, tiene, vacio,
    htmlAvatar, fondoBanner, fondoFila, claseFila, htmlPieza, htmlPin, htmlMuestra, htmlVerificado,
    escCss,
  };
})();
