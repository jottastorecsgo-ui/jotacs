(function () {
  'use strict';

  const GEMAS = [
    ['ruby_marbleized', 'Ruby', 'ruby'],
    ['sapphire_marbleized', 'Sapphire', 'sapphire'],
    ['blackpearl_marbleized', 'Black Pearl', 'pearl'],
    ['emerald_marbleized', 'Emerald', 'emerald'],
  ];

  function de(imagen, nombre) {
    if (nombre != null && !/Doppler/.test(String(nombre))) return null;
    const u = String(imagen || '');
    const m = /_doppler_phase([1-4])(?:_|$)/.exec(u);
    if (m) return { nombre: 'Fase ' + m[1], tipo: 'fase' };
    for (const [clave, texto, tipo] of GEMAS) {
      if (u.includes('_am_' + clave)) return { nombre: texto, tipo: tipo };
    }
    return null;
  }

  function texto(imagen, nombre) {
    const f = de(imagen, nombre);
    return f ? f.nombre : '';
  }

  window.JotaFase = { de: de, texto: texto };
})();
