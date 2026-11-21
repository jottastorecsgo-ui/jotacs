(function () {
  'use strict';

  const ECONOMIA = {
    pesosPorJp: 10000,
    temporadaInicio: '2026-01-01',
    temporadaMeses: 3,
    cuponDias: 30,
    hhHoras: 24,
    hhMultiplicador: 1.5,
    cotizacionRespaldo: 1200,
    topeCotizacion: 5000,
  };

  const NIVELES = [
    { nivel: 1,  jp: 1,   tipo: 'marco',  nombre: 'Marco Bronce',
      da: { marcos: ['m_bronce'], tickets: 1 } },
    { nivel: 2,  jp: 3,   tipo: 'pin',    nombre: 'Pin Recluta Bronce',
      da: { pines: ['p_recluta_bronce'], tickets: 1 } },
    { nivel: 3,  jp: 6,   tipo: 'banner', nombre: 'Banner Rezan / Farlow',
      da: { banners: ['b_rezan', 'b_farlow'], cupon: { pesos: 2000, minimo: 20000 } } },
    { nivel: 4,  jp: 10,  tipo: 'marco',  nombre: 'Marco Plata',
      da: { marcos: ['m_plata'], tickets: 2 } },
    { nivel: 5,  jp: 15,  tipo: 'eleccion', nombre: 'Elegí tu premio', opciones: [
        { id: 'tk3', tipo: 'ticket', nombre: '3 tickets extra para el Sorteo Jota', da: { tickets: 3 } },
        { id: 'jp4', tipo: 'jp',     nombre: '4 JP de bonus',    da: { jp: 4 } },
      ] },
    { nivel: 6,  jp: 22,  tipo: 'pin',    nombre: 'Pin Elite de Hierro',
      da: { pines: ['p_elite_hierro'], tickets: 2 } },
    { nivel: 7,  jp: 30,  tipo: 'banner', nombre: 'Banner Romanov / KSK',
      da: { banners: ['b_romanov', 'b_ksk'], tickets: 3 } },
    { nivel: 8,  jp: 40,  tipo: 'cupon',  nombre: 'Cupón $5.000 OFF',
      da: { cupon: { pesos: 5000, minimo: 50000 }, tickets: 3 } },
    { nivel: 9,  jp: 52,  tipo: 'banner', nombre: 'Banner Ricksaw / Voltzmann',
      da: { banners: ['b_ricksaw', 'b_voltzmann'], tickets: 4 } },
    { nivel: 10, jp: 68,  tipo: 'jp',     nombre: 'Mitad de pase: +8 JP',
      da: { jp: 8, tickets: 5 } },
    { nivel: 11, jp: 88,  tipo: 'pin',    nombre: 'Pin Guardia de Acero',
      da: { pines: ['p_guardia_acero'], tickets: 5 } },
    { nivel: 12, jp: 115, tipo: 'eleccion', nombre: 'Elegí tu premio', opciones: [
        { id: 'tk6', tipo: 'ticket', nombre: '6 tickets extra para el Sorteo Jota', da: { tickets: 6 } },
        { id: 'jp8', tipo: 'jp',     nombre: '8 JP de bonus',    da: { jp: 8 } },
      ] },
    { nivel: 13, jp: 150, tipo: 'marco',  nombre: 'Marco Oro',
      da: { marcos: ['m_oro'], cupon: { pesos: 10000, minimo: 100000 } } },
    { nivel: 14, jp: 190, tipo: 'pin',    nombre: 'Pin Táctico Supremo',
      da: { pines: ['p_tactico_supremo'], tickets: 6 } },
    { nivel: 15, jp: 240, tipo: 'evento', nombre: 'Happy Hour: 24 hs con 1,5× JP',
      da: { happyHour: true, tickets: 8 } },
    { nivel: 16, jp: 300, tipo: 'marco',  nombre: 'Marco Oro Rojo',
      da: { marcos: ['m_oro_rojo'], tickets: 8 } },
    { nivel: 17, jp: 360, tipo: 'eleccion', nombre: 'Elegí tu premio', opciones: [
        { id: 'tk10', tipo: 'ticket', nombre: '10 tickets extra para el Sorteo Jota', da: { tickets: 10 } },
        { id: 'jp12', tipo: 'jp',     nombre: '12 JP de bonus',    da: { jp: 12 } },
      ] },
    { nivel: 18, jp: 420, tipo: 'banner', nombre: 'Banner Leyenda · Bloody / Vypa',
      da: { banners: ['b_darryl', 'b_vypa'], tickets: 10 } },
    { nivel: 19, jp: 460, tipo: 'ticket', nombre: 'Mega pack: 12 tickets para el Sorteo Jota',
      da: { tickets: 12 } },
    { nivel: 20, jp: 500, tipo: 'final',  nombre: 'Pin Campeón Global',
      da: { pines: ['p_campeon_global'], tickets: 15 } },
  ];

  const DEFECTOS = Object.freeze({
    pesosPorJp: ECONOMIA.pesosPorJp,
    temporadaInicio: ECONOMIA.temporadaInicio,
    temporadaMeses: ECONOMIA.temporadaMeses,
    umbrales: Object.freeze(NIVELES.map(l => l.jp)),
  });

  function ordenarUmbrales(umbrales) {
    const out = [];
    let piso = 0;
    for (const v of umbrales) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      out.push(Math.max(n, piso));
      piso = out[out.length - 1];
    }
    return out;
  }

  function aplicarConfig(cfg) {
    if (!cfg) return;
    const num = (v, min) => { const n = Number(v); return Number.isFinite(n) && n > (min || 0) ? n : null; };
    const pj = num(cfg.pesos_por_jp);
    if (pj) ECONOMIA.pesosPorJp = pj;
    const tm = num(cfg.temporada_meses);
    if (tm) ECONOMIA.temporadaMeses = Math.round(tm);
    if (typeof cfg.temporada_inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cfg.temporada_inicio)) {
      ECONOMIA.temporadaInicio = cfg.temporada_inicio;
    }
    const cd = num(cfg.cupon_dias);
    if (cd) ECONOMIA.cuponDias = Math.round(cd);
    const cr = num(cfg.cotizacion_respaldo);
    if (cr) ECONOMIA.cotizacionRespaldo = cr;
    if (Array.isArray(cfg.umbrales) && cfg.umbrales.length) {
      const u = ordenarUmbrales(cfg.umbrales);
      for (let i = 0; i < NIVELES.length && i < u.length; i++) NIVELES[i].jp = u[i];
    }
  }

  const configActual = () => ({
    pesos_por_jp: ECONOMIA.pesosPorJp,
    temporada_inicio: ECONOMIA.temporadaInicio,
    temporada_meses: ECONOMIA.temporadaMeses,
    cupon_dias: ECONOMIA.cuponDias,
    cotizacion_respaldo: ECONOMIA.cotizacionRespaldo,
    umbrales: NIVELES.map(l => l.jp),
  });

  const configDeFabrica = () => ({
    pesos_por_jp: DEFECTOS.pesosPorJp,
    temporada_inicio: DEFECTOS.temporadaInicio,
    temporada_meses: DEFECTOS.temporadaMeses,
    cupon_dias: 30,
    cotizacion_respaldo: 1200,
    umbrales: DEFECTOS.umbrales.slice(),
  });

  const ICONOS = {
    marco:    '<rect x="3.5" y="3.5" width="17" height="17"/><circle cx="12" cy="10" r="2.8"/><path d="M7 18c1.2-2.6 8.8-2.6 10 0"/>',
    jp:       '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M9.2 10.2h5.6"/>',
    ticket:   '<path d="M3 7.5h18v3a2 2 0 0 0 0 3.9v3H3v-3a2 2 0 0 0 0-3.9z"/><path d="M14 7.5v9" stroke-dasharray="2 2.4"/>',
    pin:      '<circle cx="12" cy="9" r="5.5"/><path d="M9 13.6L7.5 21l4.5-2.6L16.5 21 15 13.6"/>',
    eleccion: '<path d="M3 6.5h5l3.5 5-3.5 5H3"/><path d="M21 6.5h-5l-3.5 5 3.5 5h5"/>',
    especial: '<path d="M12 3.5l2.4 5.2 5.6.7-4.1 3.9 1.1 5.6L12 16.2 6.9 18.9 8 13.3 3.9 9.4l5.6-.7z"/>',
    final:    '<path d="M4.5 7l3.2 2.4L12 4l4.3 5.4L19.5 7l-1.6 10.5H6.1z"/><path d="M6.1 20.5h11.8"/>',
    banner:   '<path d="M5 3h14v16.5l-7-3.6-7 3.6z"/><path d="M8.5 7.5h7"/>',
    cupon:    '<path d="M11.5 2.5H21v9.5l-9.7 9.7L2 12.2z"/><circle cx="17" cy="7" r="1.6"/>',
    evento:   '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.6 1.6"/><path d="M9 2.4h6"/>',
    desc:     '<path d="M11.5 2.5H21v9.5l-9.7 9.7L2 12.2z"/><circle cx="17" cy="7" r="1.6"/>',
    check:    '<path d="M4 12.5l5 5L20 6.5"/>',
    candado:  '<rect x="5" y="10.5" width="14" height="9.5"/><path d="M8.2 10.5V7.4a3.8 3.8 0 0 1 7.6 0v3.1"/>',
    bajar:    '<path d="M12 4v11"/><path d="M6.5 10.5L12 16l5.5-5.5"/><path d="M4.5 19.5h15"/>',
    cerrar:   '<path d="M5 5l14 14M19 5L5 19"/>',
  };

  function svg(tipo, px, grosor) {
    const d = ICONOS[tipo];
    if (!d) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (grosor || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
      'style="width:' + px + 'px;height:' + px + 'px;display:block">' + d + '</svg>';
  }

  const meta = () => NIVELES[NIVELES.length - 1];
  const nivelPorNumero = (n) => NIVELES.find(l => l.nivel === Number(n)) || null;

  function nivelDe(jp) {
    let n = 0;
    for (const l of NIVELES) if (jp >= l.jp) n = l.nivel;
    return n;
  }

  function progreso(jp) {
    const fin = meta();
    const siguiente = NIVELES.find(l => l.jp > jp) || null;
    const faltan = siguiente ? siguiente.jp - jp : 0;
    const pct = fin.jp > 0 ? Math.max(0, Math.min(100, (jp / fin.jp) * 100)) : 0;
    return { jp, nivel: nivelDe(jp), siguiente, faltan, pct, meta: fin };
  }

  const aFecha = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const soloDia = typeof v === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (soloDia) return new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]), 0, 0, 0, 0);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const idTemporada = (desde) =>
    't' + desde.getFullYear() + '-' + String(desde.getMonth() + 1).padStart(2, '0');

  function temporadaDe(fecha) {
    const ahora = aFecha(fecha) || new Date();
    const ini = aFecha(ECONOMIA.temporadaInicio) || new Date();
    const meses = Math.max(1, ECONOMIA.temporadaMeses);

    const diff = (ahora.getFullYear() - ini.getFullYear()) * 12 + (ahora.getMonth() - ini.getMonth());
    let n = Math.floor(diff / meses);
    if (n < 0) n = 0;
    const desde = new Date(ini.getFullYear(), ini.getMonth() + n * meses, ini.getDate(), 0, 0, 0, 0);
    if (ahora < desde && n > 0) n -= 1;

    const d = new Date(ini.getFullYear(), ini.getMonth() + n * meses, ini.getDate(), 0, 0, 0, 0);
    const h = new Date(ini.getFullYear(), ini.getMonth() + (n + 1) * meses, ini.getDate(), 0, 0, 0, 0);
    return { numero: n + 1, id: idTemporada(d), desde: d, hasta: h };
  }

  function mesDe(fecha) {
    const f = aFecha(fecha) || new Date();
    const d = new Date(f.getFullYear(), f.getMonth(), 1, 0, 0, 0, 0);
    const h = new Date(f.getFullYear(), f.getMonth() + 1, 1, 0, 0, 0, 0);
    return { id: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), desde: d, hasta: h };
  }

  function pesosDeOrden(o) {
    if (!o) return 0;
    const usdt = Number(o.total_usdt) || 0;
    const techo = usdt * ECONOMIA.topeCotizacion;
    const ars = Number(o.total_ars);
    if (ars > 0) return Math.min(ars, techo);
    const guardada = Number(o.usdt_ars_rate);
    const cot = guardada > 0
      ? Math.min(guardada, ECONOMIA.topeCotizacion)
      : ECONOMIA.cotizacionRespaldo;
    return usdt * cot;
  }

  const entregada = (o) => o && o.status === 'delivered';

  function ordenesEn(ordenes, desde, hasta) {
    return (ordenes || []).filter(o => {
      if (!entregada(o)) return false;
      const f = aFecha(o.created_at);
      return f && f >= desde && f < hasta;
    });
  }

  function jpDeOrdenes(ordenes, hhHasta) {
    const fin = aFecha(hhHasta);
    const ini = fin ? new Date(fin.getTime() - ECONOMIA.hhHoras * 3600000) : null;
    let pesos = 0;
    for (const o of (ordenes || [])) {
      if (!entregada(o)) continue;
      const f = aFecha(o.created_at);
      const dentro = ini && f && f >= ini && f < fin;
      pesos += pesosDeOrden(o) * (dentro ? ECONOMIA.hhMultiplicador : 1);
    }
    return Math.floor(pesos / ECONOMIA.pesosPorJp);
  }

  const listaReclamados = (t) => (t && Array.isArray(t.reclamados)) ? t.reclamados : [];
  const mapaElegidos = (t) => (t && t.elegidos) ? t.elegidos : {};

  function opcionDe(nivel, opId) {
    const l = nivelPorNumero(nivel);
    if (!l || !l.opciones) return null;
    return l.opciones.find(o => o.id === opId) || null;
  }
  const nombreElegido = (nivel, opId) => (opcionDe(nivel, opId) || {}).nombre || '';

  function premioDe(nivel, opId) {
    const l = nivelPorNumero(nivel);
    if (!l) return null;
    if (l.opciones) { const o = opcionDe(nivel, opId); return o ? (o.da || null) : null; }
    return l.da || null;
  }

  function bonusReclamado(jp, tempPase) {
    const rec = listaReclamados(tempPase);
    const ele = mapaElegidos(tempPase);
    let total = 0;
    for (const l of NIVELES) {
      if (jp < l.jp || rec.indexOf(l.nivel) === -1) continue;
      const da = premioDe(l.nivel, ele[l.nivel]);
      if (da && da.jp) total += Number(da.jp) || 0;
    }
    return total;
  }

  function jpDeTemporada(ordenes, tempPase, jpExtra) {
    const extra = Number(jpExtra) || 0;
    const cuenta = (hh) => {
      const piso = jpDeOrdenes(ordenes, hh) + extra;
      let jp = piso;
      for (let i = 0; i <= NIVELES.length; i++) {
        const nuevo = piso + bonusReclamado(jp, tempPase);
        if (nuevo === jp) break;
        jp = nuevo;
      }
      return jp;
    };
    const jpSinHh = cuenta(null);
    return hhValido(jpSinHh, tempPase) ? cuenta(tempPase.hh_hasta) : jpSinHh;
  }

  function hhValido(jpSinHh, tempPase) {
    if (!tempPase || !tempPase.hh_hasta) return false;
    const rec = listaReclamados(tempPase);
    return NIVELES.some(l => l.da && l.da.happyHour
      && jpSinHh >= l.jp && rec.indexOf(l.nivel) !== -1);
  }

  function codigoCupon(uid, tempId, nivel) {
    const s = String(uid || '') + '|' + String(tempId || '') + '|' + nivel;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let cod = '';
    for (let i = 0; i < 6; i++) { cod += abc[h % abc.length]; h = Math.floor(h / abc.length) || (h ^ 0x9E3779B9) >>> 0; }
    return 'JP-' + cod;
  }

  function ganadoEnTemporada(jp, tempPase, uid, tempId, ahora) {
    const rec = listaReclamados(tempPase);
    const ele = mapaElegidos(tempPase);
    const cuando = mapaCuando(tempPase);
    const hoy = aFecha(ahora) || new Date();
    const r = { marcos: [], banners: [], pines: [], cupones: [], jp: 0, tickets: 0, happyHour: null };
    const sumar = (tipo, id) => { if (r[tipo].indexOf(id) === -1) r[tipo].push(id); };

    for (const l of NIVELES) {
      if (jp < l.jp || rec.indexOf(l.nivel) === -1) continue;
      const da = premioDe(l.nivel, ele[l.nivel]);
      if (!da) continue;
      for (const tipo of ['marcos', 'banners', 'pines']) {
        for (const id of (da[tipo] || [])) sumar(tipo, id);
      }
      if (da.jp) r.jp += Number(da.jp) || 0;
      if (da.tickets) r.tickets += Number(da.tickets) || 0;
      if (da.happyHour) r.happyHour = aFecha(tempPase && tempPase.hh_hasta);
      if (da.cupon) {
        const desde = aFecha(cuando[l.nivel]);
        const vence = desde ? new Date(desde.getTime() + ECONOMIA.cuponDias * 86400000) : null;
        r.cupones.push({
          nivel: l.nivel,
          pesos: Number(da.cupon.pesos) || 0,
          minimo: Number(da.cupon.minimo) || 0,
          codigo: codigoCupon(uid, tempId, l.nivel),
          reclamado_en: desde,
          vence_el: vence,
          vencido: !!(vence && hoy >= vence),
          temporada: tempId,
        });
      }
    }
    return r;
  }

  const mapaCuando = (t) => (t && t.cuando) ? t.cuando : {};

  function paseDe(ficha) {
    const d = ficha || {};
    const out = {};
    const legado = d.pase || {};
    for (const id of Object.keys(legado)) {
      const t = legado[id] || {};
      out[id] = {
        reclamados: listaReclamados(t).slice(),
        elegidos: Object.assign({}, mapaElegidos(t)),
        cuando: Object.assign({}, mapaCuando(t)),
        hh_hasta: t.hh_hasta || null,
      };
    }
    for (const r of (Array.isArray(d._reclamos) ? d._reclamos : [])) {
      if (!r) continue;
      const vent = temporadaPorId(r.temp);
      const f = aFecha(r.cuando);
      const l = nivelPorNumero(r.nivel);
      if (!vent || !f || !l || f < vent.desde || f >= vent.hasta) continue;
      const tp = out[r.temp] || (out[r.temp] = { reclamados: [], elegidos: {}, cuando: {}, hh_hasta: null });
      if (tp.reclamados.indexOf(l.nivel) === -1) tp.reclamados.push(l.nivel);
      if (r.eleccion) tp.elegidos[l.nivel] = r.eleccion;
      tp.cuando[l.nivel] = f;
      if (l.da && l.da.happyHour) tp.hh_hasta = new Date(f.getTime() + ECONOMIA.hhHoras * 3600000);
    }
    return out;
  }

  function jpRegaloDe(ficha, tempId, actualId) {
    const d = ficha || {};
    const mapa = (d.jp_regalo && typeof d.jp_regalo === 'object') ? d.jp_regalo : {};
    let jp = Number(mapa[tempId]) || 0;
    const viejo = Number(d.jp_extra) || 0;
    if (viejo) {
      if ((actualId || temporadaDe(new Date()).id) === tempId) jp += viejo;
    }
    return jp;
  }

  function estadoDe(ficha, ordenes, uid, ahora) {
    const d = ficha || {};
    const quien = uid || d.uid;
    const hoy = aFecha(ahora) || new Date();
    const temp = temporadaDe(hoy);
    const pase = paseDe(d);
    const tempPase = pase[temp.id] || {};
    const regalo = jpRegaloDe(d, temp.id, temp.id);

    const ordenesTemp = ordenesEn(ordenes, temp.desde, temp.hasta);
    const jp = jpDeTemporada(ordenesTemp, tempPase, regalo);
    const tiene = ganadoEnTemporada(jp, tempPase, quien, temp.id, hoy);

    const cos = { marcos: [], banners: [], pines: [] };
    const sumar = (o) => {
      for (const tipo of ['marcos', 'banners', 'pines']) {
        for (const id of o[tipo]) if (cos[tipo].indexOf(id) === -1) cos[tipo].push(id);
      }
    };
    for (const id of Object.keys(pase)) {
      if (id === temp.id) { sumar(tiene); continue; }
      const t = pase[id] || {};
      const vieja = temporadaPorId(id);
      const oV = vieja ? ordenesEn(ordenes, vieja.desde, vieja.hasta) : [];
      sumar(ganadoEnTemporada(jpDeTemporada(oV, t, jpRegaloDe(d, id, temp.id)), t, quien, id, hoy));
    }
    const ex = d.extras || {};
    for (const tipo of ['marcos', 'banners', 'pines']) {
      for (const id of (Array.isArray(ex[tipo]) ? ex[tipo] : [])) {
        if (cos[tipo].indexOf(id) === -1) cos[tipo].push(id);
      }
    }

    const hh = hhValido(jpDeOrdenes(ordenesTemp, null) + regalo, tempPase)
      ? aFecha(tempPase.hh_hasta) : null;
    return {
      temporada: temp,
      jp,
      gasto: ordenesTemp.reduce((s, o) => s + pesosDeOrden(o), 0),
      ordenes: ordenesTemp,
      pase: tempPase,
      reclamados: listaReclamados(tempPase),
      elegidos: mapaElegidos(tempPase),
      tiene,
      cosmeticos: cos,
      progreso: progreso(jp),
      happyHour: hh && hh > hoy ? { hasta: hh, multiplicador: ECONOMIA.hhMultiplicador } : null,
    };
  }

  function cosmeticosAlcanzados(ficha, ordenes, uid, ahora) {
    const d = ficha || {};
    const hoy = aFecha(ahora) || new Date();
    const actual = temporadaDe(hoy);
    const pase = paseDe(d);
    const cos = { marcos: [], banners: [], pines: [] };
    const sumar = (tipo, id) => { if (cos[tipo].indexOf(id) === -1) cos[tipo].push(id); };

    const hastaLosJp = (jp) => {
      for (const l of NIVELES) {
        if (jp < l.jp || !l.da) continue;
        for (const tipo of ['marcos', 'banners', 'pines']) {
          for (const id of (l.da[tipo] || [])) sumar(tipo, id);
        }
      }
    };

    const temporadas = {};
    temporadas[actual.id] = actual;
    for (const id of Object.keys(pase)) {
      const t = temporadaPorId(id);
      if (t) temporadas[id] = t;
    }
    for (const o of (ordenes || [])) {
      if (!entregada(o)) continue;
      const f = aFecha(o.created_at);
      if (!f) continue;
      const t = temporadaDe(f);
      if (t) temporadas[t.id] = t;
    }

    for (const id of Object.keys(temporadas)) {
      const t = temporadas[id];
      hastaLosJp(jpDeTemporada(ordenesEn(ordenes, t.desde, t.hasta), pase[id] || {}, jpRegaloDe(d, id, actual.id)));
    }

    const ex = d.extras || {};
    for (const tipo of ['marcos', 'banners', 'pines']) {
      for (const id of (Array.isArray(ex[tipo]) ? ex[tipo] : [])) sumar(tipo, id);
    }
    return cos;
  }

  function temporadaPorId(id) {
    const m = /^t(\d{4})-(\d{2})$/.exec(String(id || ''));
    if (!m) return null;
    const ini = aFecha(ECONOMIA.temporadaInicio) || new Date();
    const desde = new Date(Number(m[1]), Number(m[2]) - 1, ini.getDate(), 0, 0, 0, 0);
    const hasta = new Date(Number(m[1]), Number(m[2]) - 1 + Math.max(1, ECONOMIA.temporadaMeses), ini.getDate(), 0, 0, 0, 0);
    return { id: id, desde, hasta };
  }

  function ticketsDelPase(ficha, ordenes, desde, hasta) {
    const d = ficha || {};
    const pase = paseDe(d);
    const actual = temporadaDe(new Date()).id;
    const eventos = [];
    for (const id of Object.keys(pase)) {
      const t = pase[id] || {};
      const vent = temporadaPorId(id);
      if (!vent) continue;
      const jp = jpDeTemporada(ordenesEn(ordenes, vent.desde, vent.hasta), t, jpRegaloDe(d, id, actual));
      const cuando = mapaCuando(t);
      const rec = listaReclamados(t);
      const ele = mapaElegidos(t);
      for (const l of NIVELES) {
        if (jp < l.jp || rec.indexOf(l.nivel) === -1) continue;
        const f = aFecha(cuando[l.nivel]);
        if (!f || f < desde || f >= hasta) continue;
        const da = premioDe(l.nivel, ele[l.nivel]);
        if (da && da.tickets) eventos.push({ cuando: f, tickets: Number(da.tickets) || 0, nivel: l.nivel });
      }
    }
    return eventos;
  }

  function ticketsDelMes(ficha, ordenes, uid, mes) {
    const m = mes || mesDe(new Date());
    return ticketsDelPase(ficha, ordenes, m.desde, m.hasta).reduce((s, e) => s + e.tickets, 0);
  }

  function cuponesDe(ficha, ordenes, uid, ahora) {
    const d = ficha || {};
    const hoy = aFecha(ahora) || new Date();
    const pase = paseDe(d);
    const actual = temporadaDe(hoy).id;
    const usados = Array.isArray(d.jp_cupones_usados) ? d.jp_cupones_usados : [];
    const out = [];
    for (const id of Object.keys(pase)) {
      const vent = temporadaPorId(id);
      if (!vent) continue;
      const t = pase[id];
      const jp = jpDeTemporada(ordenesEn(ordenes, vent.desde, vent.hasta), t, jpRegaloDe(d, id, actual));
      for (const c of ganadoEnTemporada(jp, t, uid || d.uid, id, hoy).cupones) {
        out.push(Object.assign(c, { usado: usados.indexOf(c.codigo) !== -1 }));
      }
    }
    return out;
  }

  function revisarCupon(ficha, ordenes, uid, codigo, ahora) {
    const c = cuponesDe(ficha, ordenes, uid, ahora).filter(x => x.codigo === codigo)[0];
    if (!c) return { motivo: 'no es un cupón del Battle Pass de esta cuenta, o el nivel todavía no está alcanzado' };
    if (c.vencido) return { motivo: 'está vencido', cupon: c };
    if (c.usado) return { motivo: 'ya se usó en otra compra', cupon: c };
    return { cupon: c };
  }

  function estado(l, jp, reclamados) {
    if (reclamados && reclamados.indexOf(l.nivel) !== -1) return 'reclamado';
    if (jp < l.jp) return 'bloqueado';
    return l.opciones ? 'elegir' : 'reclamar';
  }

  function puedeReclamar(nivel, jp, tempPase) {
    const l = nivelPorNumero(nivel);
    if (!l || jp < l.jp) return false;
    return listaReclamados(tempPase).indexOf(nivel) === -1;
  }

  function textoTickets(n) {
    return '+' + n + (Number(n) === 1 ? ' ticket' : ' tickets') + ' Sorteo Jota';
  }

  function ticketsExtra(nivel) {
    const l = nivelPorNumero(nivel);
    if (!l || !l.da || l.tipo === 'ticket') return 0;
    return Number(l.da.tickets) || 0;
  }

  function resumen(da) {
    if (!da) return '—';
    const C = window.JotaCosmeticos;
    const nom = (tipo, id) => (C && C.nombreDe(tipo, id)) || id;
    const p = [];
    for (const id of (da.marcos  || [])) p.push('Marco ' + nom('marcos', id));
    for (const id of (da.banners || [])) p.push('Banner ' + nom('banners', id));
    for (const id of (da.pines   || [])) p.push('Pin ' + nom('pines', id));
    if (da.cupon)     p.push('Cupón $' + Number(da.cupon.pesos).toLocaleString('es-AR') + ' OFF');
    if (da.jp)        p.push(da.jp + ' JP');
    if (da.tickets)   p.push(textoTickets(da.tickets));
    if (da.happyHour) p.push('Happy Hour ' + ECONOMIA.hhMultiplicador + '×');
    return p.length ? p.join(' · ') : '—';
  }

  function nivelQueDa(tipo, id) {
    for (const l of NIVELES) {
      if (l.da && (l.da[tipo] || []).indexOf(id) !== -1) return l.nivel;
      for (const o of (l.opciones || [])) {
        if (o.da && (o.da[tipo] || []).indexOf(id) !== -1) return l.nivel;
      }
    }
    return null;
  }

  function registroJp(ficha, ordenes, uid, ahora) {
    const d = ficha || {};
    const hoy = aFecha(ahora) || new Date();
    const temp = temporadaDe(hoy);
    const tempPase = paseDe(d)[temp.id] || {};
    const regalo = jpRegaloDe(d, temp.id, temp.id);
    const ords = ordenesEn(ordenes, temp.desde, temp.hasta)
      .slice().sort((a, b) => aFecha(a.created_at) - aFecha(b.created_at));
    const total = jpDeTemporada(ords, tempPase, regalo);
    const sinHh = jpDeTemporada(ords, Object.assign({}, tempPase, { hh_hasta: null }), regalo);
    const finHh = hhValido(sinHh, tempPase) ? aFecha(tempPase.hh_hasta) : null;
    const iniHh = finHh ? new Date(finHh.getTime() - ECONOMIA.hhHoras * 3600000) : null;

    const filas = [];
    let pesos = 0, antes = 0;
    for (const o of ords) {
      const f = aFecha(o.created_at);
      const conHh = !!(finHh && f >= iniHh && f < finHh);
      const p = pesosDeOrden(o);
      pesos += p * (conHh ? ECONOMIA.hhMultiplicador : 1);
      const jp = Math.floor(pesos / ECONOMIA.pesosPorJp);
      filas.push({ tipo: 'compra', cuando: f, orden: o.order_id || o.id || '', pesos: p, happyHour: conHh, jp: jp - antes });
      antes = jp;
    }
    const rec = listaReclamados(tempPase);
    const ele = mapaElegidos(tempPase);
    const cuando = mapaCuando(tempPase);
    for (const l of NIVELES) {
      if (total < l.jp || rec.indexOf(l.nivel) === -1) continue;
      const da = premioDe(l.nivel, ele[l.nivel]);
      if (da && da.jp) filas.push({ tipo: 'bonus', cuando: aFecha(cuando[l.nivel]), nivel: l.nivel, jp: Number(da.jp) || 0 });
    }
    if (regalo) filas.push({ tipo: 'regalo', cuando: null, jp: regalo });
    filas.sort((a, b) => (b.cuando ? b.cuando.getTime() : Infinity) - (a.cuando ? a.cuando.getTime() : Infinity));
    return { temporada: temp, total, filas };
  }

  function ticketsDeSorteo(ficha, ordenes, uid, sorteo) {
    const r = sorteo || {};
    const desde = aFecha(r.starts_at);
    const hasta = aFecha(r.ends_at);
    const precio = Number(r.ticket_price_usdt) > 0 ? Number(r.ticket_price_usdt) : 6.25;
    const yo = (Array.isArray(r.participants) ? r.participants : []).find(p => p && p.uid === uid) || null;
    let compras = 0, pase = 0;
    if (desde && hasta) {
      let gastado = 0;
      for (const o of (ordenes || [])) {
        if (!entregada(o) || !(Number(o.total_usdt) > 0)) continue;
        const f = aFecha(o.created_at);
        if (f && f >= desde && f <= hasta) gastado += Number(o.total_usdt);
      }
      compras = Math.floor(gastado / precio + 1e-9);
      pase = ticketsDelPase(ficha, ordenes, desde, new Date(hasta.getTime() + 1)).reduce((s, e) => s + e.tickets, 0);
    }
    return {
      tickets: yo ? Number(yo.tickets) || 0 : 0,
      numeros: yo && Array.isArray(yo.numeros) ? yo.numeros.slice() : [],
      deCompras: compras,
      delPase: pase,
      gano: !!(r.winner_uid && r.winner_uid === uid && r.status === 'winner_announced'),
    };
  }

  window.JotaPase = {
    NIVELES, ICONOS, ECONOMIA, DEFECTOS,
    aplicarConfig, configActual, configDeFabrica, ordenarUmbrales,
    svg, meta, nivelDe, progreso, estado, nivelPorNumero, opcionDe, nombreElegido,
    nivelQueDa, premioDe, resumen, textoTickets, ticketsExtra,
    aFecha, temporadaDe, temporadaPorId, mesDe, idTemporada,
    pesosDeOrden, ordenesEn, jpDeOrdenes, jpDeTemporada, bonusReclamado,
    codigoCupon, ganadoEnTemporada, cosmeticosAlcanzados, estadoDe, ticketsDelMes,
    ticketsDelPase, cuponesDe, revisarCupon, paseDe, jpRegaloDe,
    puedeReclamar, hhValido, registroJp, ticketsDeSorteo,
  };
})();
