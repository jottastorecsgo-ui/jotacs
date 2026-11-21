(function () {
  'use strict';

  const CONFIG_DEFECTO = {
    pct: 1.15,

    pct_stickers: 0.10,

    lock: { dias: 1, tipo: 'ninguno', valor: 0, tope: 0 },

    float_extra: { pct: 0, tramo: 0.1, rangos: {} },
  };

  const RANGOS_FLOAT = {
    'Factory New': [0, 0.07], 'Minimal Wear': [0.07, 0.15], 'Field-Tested': [0.15, 0.38],
    'Well-Worn': [0.38, 0.45], 'Battle-Scarred': [0.45, 1],
  };

  const MAX_TRAMOS = 10;

  function limpiarRangos(crudo) {
    const salida = {};
    if (!crudo || typeof crudo !== 'object') return salida;
    for (const desgaste of Object.keys(RANGOS_FLOAT)) {
      const [min, max] = RANGOS_FLOAT[desgaste];
      const lista = (Array.isArray(crudo[desgaste]) ? crudo[desgaste] : [])
        .map(t => ({
          d: Math.max(min, Math.min(max, Number(t && t.d))),
          h: Math.max(min, Math.min(max, Number(t && t.h))),
          p: Number(t && t.p),
        }))
        .filter(t => isFinite(t.d) && isFinite(t.h) && t.h > t.d && t.p > 0 && t.p <= 1)
        .sort((a, b) => a.d - b.d);
      const ok = [];
      for (const t of lista) {
        const previo = ok[ok.length - 1];
        if (previo && t.d < previo.h) t.d = previo.h;
        if (t.h > t.d) ok.push(t);
        if (ok.length >= MAX_TRAMOS) break;
      }
      if (ok.length) salida[desgaste] = ok;
    }
    return salida;
  }

  const copiarRangos = (r) => {
    const o = {};
    for (const k of Object.keys(r || {})) o[k] = r[k].map(t => ({ d: t.d, h: t.h, p: t.p }));
    return o;
  };

  let CONFIG = Object.assign({}, CONFIG_DEFECTO, {
    lock: Object.assign({}, CONFIG_DEFECTO.lock),
    float_extra: Object.assign({}, CONFIG_DEFECTO.float_extra, { rangos: {} }),
  });

  function aplicarConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return configActual();
    const n = Object.assign({}, CONFIG_DEFECTO, CONFIG, cfg);
    n.lock = Object.assign({}, CONFIG_DEFECTO.lock, CONFIG.lock, cfg.lock || {});
    n.float_extra = Object.assign({}, CONFIG_DEFECTO.float_extra, CONFIG.float_extra, cfg.float_extra || {});
    const fp = Number(n.float_extra.pct), ft = Number(n.float_extra.tramo);
    n.float_extra = {
      pct: fp >= 0 && fp <= 1 ? fp : 0,
      tramo: ft > 0 && ft <= 1 ? ft : CONFIG_DEFECTO.float_extra.tramo,
      rangos: limpiarRangos(n.float_extra.rangos),
    };
    if (!(Number(n.pct) > 0)) n.pct = CONFIG_DEFECTO.pct;
    if (!(Number(n.pct_stickers) >= 0)) n.pct_stickers = CONFIG_DEFECTO.pct_stickers;
    CONFIG = n;
    return configActual();
  }

  function configActual() {
    return Object.assign({}, CONFIG, {
      lock: Object.assign({}, CONFIG.lock),
      float_extra: Object.assign({}, CONFIG.float_extra, { rangos: copiarRangos(CONFIG.float_extra.rangos) }),
    });
  }

  function filasCsv(texto) {
    const filas = [];
    let campo = '', fila = [], entreComillas = false;
    const t = String(texto || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (entreComillas) {
        if (c === '"') {
          if (t[i + 1] === '"') { campo += '"'; i++; }
          else entreComillas = false;
        } else campo += c;
      } else if (c === '"') {
        entreComillas = true;
      } else if (c === ',') {
        fila.push(campo); campo = '';
      } else if (c === '\n') {
        fila.push(campo); filas.push(fila); fila = []; campo = '';
      } else campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  const COLUMNAS = {
    nombre:   ['name', 'nombre', 'item', 'market hash name'],
    desgaste: ['exterior', 'wear', 'desgaste'],
    float:    ['float value', 'float', 'floatvalue'],
    stickers: ['sticker price', 'stickers', 'sticker value'],
    lock:     ['tradability', 'trade lock', 'tradelock', 'tradable'],
    precio:   ['price', 'precio', 'buff price', 'youpin price', 'price (usd)', 'price usd'],
  };

  function ubicarColumnas(cabecera) {
    const norm = (cabecera || []).map(c => String(c || '').trim().toLowerCase());
    const pos = {};
    for (const clave of Object.keys(COLUMNAS)) {
      pos[clave] = norm.findIndex(c => c && COLUMNAS[clave].includes(c));
    }
    return pos;
  }

  function normalizarNombre(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function aNumero(s) {
    const t = String(s || '').replace(/[$\s,]/g, '');
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  }

  function aFecha(s) {
    const t = String(s || '').trim();
    if (!t) return 0;
    const ms = Date.parse(t);
    return isFinite(ms) ? ms : 0;
  }

  function parsearCsv(texto) {
    const filas = filasCsv(texto).filter(f => f.some(c => String(c || '').trim() !== ''));
    if (!filas.length) return { filas: [], problemas: ['El archivo está vacío.'] };

    const pos = ubicarColumnas(filas[0]);
    const problemas = [];
    if (pos.nombre < 0) {
      return { filas: [], problemas: ['El archivo no tiene una columna "Name".'] };
    }
    if (pos.float < 0) problemas.push('El archivo no trae la columna "Float value": los items van a salir con "consultar float".');

    const dato = (f, i) => (i >= 0 && i < f.length) ? String(f[i] || '').trim() : '';
    const salida = [];
    for (let i = 1; i < filas.length; i++) {
      const f = filas[i];
      const nombre = normalizarNombre(dato(f, pos.nombre));
      if (!nombre) continue;
      const desgaste = normalizarNombre(dato(f, pos.desgaste));
      salida.push({
        fila: i + 1,
        nombre: nombre,
        desgaste: desgaste,
        clave: desgaste ? nombre + ' (' + desgaste + ')' : nombre,
        float: aNumero(dato(f, pos.float)),
        stickers: aNumero(dato(f, pos.stickers)) || 0,
        lock: aFecha(dato(f, pos.lock)),
        precio: aNumero(dato(f, pos.precio)),
      });
    }
    return { filas: salida, problemas: problemas };
  }

  const RE_FASE = /\s*\((Phase [1-4]|Ruby|Sapphire|Black Pearl|Emerald)\)/;
  const IMAGEN_FASE = {
    'Phase 1': /_doppler_phase1(?:_|$)/, 'Phase 2': /_doppler_phase2(?:_|$)/,
    'Phase 3': /_doppler_phase3(?:_|$)/, 'Phase 4': /_doppler_phase4(?:_|$)/,
    'Ruby': /_am_ruby_marbleized/, 'Sapphire': /_am_sapphire_marbleized/,
    'Black Pearl': /_am_blackpearl_marbleized/, 'Emerald': /_am_emerald_marbleized/,
  };

  function conFase(nombre, fase) {
    const m = /^(.*?)(\s*\([^()]*\))$/.exec(nombre);
    return m ? m[1] + ' (' + fase + ')' + m[2] : nombre + ' (' + fase + ')';
  }

  function cruzar(filas, catalogo) {
    const indice = {};
    const todos = {};
    for (const it of (catalogo || [])) {
      const k = normalizarNombre(it.market_hash_name);
      if (!k) continue;
      if (!indice[k]) indice[k] = it;
      (todos[k] = todos[k] || []).push(it);
    }

    const unidades = [];
    const omitidos = [];
    const agrupadas = {};

    for (const f of (filas || [])) {
      let it = indice[f.clave];
      let fase = null;
      if (!it) {
        const m = RE_FASE.exec(f.clave);
        const base = m ? normalizarNombre(f.clave.replace(RE_FASE, '')) : '';
        if (!m || !todos[base]) {
          omitidos.push({ nombre: f.clave, motivo: 'sin_catalogo' });
          continue;
        }
        if (!(Number(f.precio) > 0)) {
          omitidos.push({ nombre: f.clave, motivo: 'fase_sin_precio' });
          continue;
        }
        const exacta = todos[base].find(x => IMAGEN_FASE[m[1]].test(String(x.image_url || '')));
        it = exacta || todos[base][0];
        fase = exacta ? null : m[1];
      }

      const tieneFloat = Number(f.float) > 0;
      const tieneStickers = Number(f.stickers) > 0;

      if (!tieneFloat && !tieneStickers) {
        const k = it.id + '|' + f.lock + (fase ? '|' + fase : '');
        if (agrupadas[k]) { agrupadas[k].n++; continue; }
        const u = nuevaUnidad(it, f, fase);
        agrupadas[k] = u;
        unidades.push(u);
        continue;
      }

      unidades.push(nuevaUnidad(it, f, fase));
    }

    return { unidades: unidades, omitidos: omitidos };
  }

  function nuevaUnidad(it, f, fase) {
    const u = {
      u: idUnidad(it.id, f) + (fase ? ':' + fase.replace(/\s+/g, '') : ''),
      i: String(it.id),
      f: Number(f.float) > 0 ? Number(f.float) : null,
      s: Number(f.stickers) > 0 ? Number(f.stickers) : 0,
      t: Number(f.lock) || 0,
      n: 1,
      p: null,
      d: null,
      y: Number(f.precio) > 0 ? Number(f.precio) : null,
    };
    if (fase) u.z = fase;
    return u;
  }

  function idUnidad(itemId, f) {
    const fl = Number(f.float) > 0 ? Number(f.float).toFixed(10) : '';
    const st = Number(f.stickers) > 0 ? Number(f.stickers).toFixed(2) : '';
    return itemId + ':' + fl + ':' + st + ':' + (Number(f.lock) || 0);
  }

  function conservarAjustes(nuevas, viejas) {
    const antes = {};
    for (const v of (viejas || [])) antes[v.u] = v;
    let pasados = 0;
    for (const n of nuevas) {
      const v = antes[n.u];
      if (!v) continue;
      if (v.p != null || v.d != null) pasados++;
      if (v.p != null) n.p = v.p;
      if (v.d != null) n.d = v.d;
    }
    return pasados;
  }

  function diasDeLock(ts, ahora) {
    const t = Number(ts) || 0;
    if (!t) return 0;
    const falta = t - (ahora || Date.now());
    if (falta <= 0) return 0;
    return Math.ceil(falta / 86400000);
  }

  function redondear(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function descuentoDe(subtotal, regla) {
    if (!regla || regla.tipo === 'ninguno' || !regla.tipo) return 0;
    const valor = Number(regla.valor) || 0;
    if (valor <= 0) return 0;
    let d = 0;
    if (regla.tipo === 'fijo') d = valor;
    else if (regla.tipo === 'pct') d = subtotal * valor / 100;
    else if (regla.tipo === 'pct_tope') {
      const tope = Number(regla.tope) || 0;
      d = subtotal * valor / 100;
      if (tope > 0) d = Math.min(d, tope);
    }
    return Math.min(Math.max(d, 0), subtotal);
  }

  function factorFloat(unidad, item, c) {
    const fe = (c && c.float_extra) || {};
    const tramos = fe.rangos && item && Array.isArray(fe.rangos[item.wear]) ? fe.rangos[item.wear] : null;
    if (tramos && tramos.length) {
      const f = Number(unidad && unidad.f);
      if (!(f > 0)) return 0;
      const r = RANGOS_FLOAT[item.wear];
      const t = tramos.find(x => f >= x.d && (f < x.h || (f === x.h && r && x.h === r[1])));
      return t ? Number(t.p) || 0 : 0;
    }
    const pct = Number(fe.pct) || 0;
    const tramo = Number(fe.tramo) || 0;
    if (!(pct > 0) || !(tramo > 0)) return 0;
    const f = Number(unidad && unidad.f);
    const r = RANGOS_FLOAT[item && item.wear];
    if (!(f > 0) || !r || f < r[0] || f > r[1]) return 0;
    const pos = (f - r[0]) / (r[1] - r[0]);
    if (pos >= tramo) return 0;
    return pct * (1 - pos / tramo);
  }

  function precioDe(unidad, item, cfg, ahora) {
    const c = cfg || configActual();
    const delCsv = Number(unidad && unidad.y) > 0;
    const ypCatalogo = Number(item && item.youpin_price_usd) || 0;
    const yp = delCsv ? Number(unidad.y) : ypCatalogo;
    const pedido = Number(item && item.final_price_usdt) || 0;
    const manual = !!(unidad && unidad.p != null);

    const calculado = yp > 0 ? redondear(yp * Number(c.pct)) : redondear(pedido);
    const base = manual ? redondear(unidad.p) : calculado;
    const origen = manual ? 'manual' : delCsv ? 'csv' : ypCatalogo > 0 ? 'youpin' : pedido > 0 ? 'pedido' : 'ninguno';
    const extraFloat = manual ? 0 : redondear(base * factorFloat(unidad, item, c));
    const stickers = redondear((Number(unidad && unidad.s) || 0) * Number(c.pct_stickers));
    const subtotal = redondear(base + extraFloat + stickers);

    const dias = diasDeLock(unidad && unidad.t, ahora);
    let regla = null;
    if (unidad && unidad.d) regla = unidad.d;
    else if (dias >= (Number(c.lock.dias) || 0) && dias > 0) regla = c.lock;

    const descuento = redondear(descuentoDe(subtotal, regla));
    return {
      base: base,
      manual: manual,
      origen: origen,
      extra_float: extraFloat,
      stickers_valor: Number(unidad && unidad.s) || 0,
      stickers: stickers,
      subtotal: subtotal,
      dias_lock: dias,
      descuento: descuento,
      total: redondear(subtotal - descuento),
    };
  }

  const COLS = ['u', 'i', 'f', 's', 't', 'n', 'p', 'd', 'y'];

  function empaquetar(unidades) {
    return (unidades || []).map(x => {
      const r = [
        x.u, x.i, x.f, x.s, x.t, x.n || 1,
        x.p == null ? null : x.p,
        x.d || null,
        x.y == null ? null : x.y,
      ];
      if (x.z) r.push(x.z);
      return r;
    });
  }

  function desempaquetar(filas) {
    return (filas || []).map(r => {
      const u = {
        u: r[0], i: String(r[1]), f: r[2], s: r[3] || 0, t: r[4] || 0,
        n: r[5] || 1, p: r[6] == null ? null : r[6], d: r[7] || null,
        y: r[8] == null ? null : r[8],
      };
      if (typeof r[9] === 'string' && IMAGEN_FASE[r[9]]) u.z = r[9];
      return u;
    });
  }

  function estadoFloat(unidad, item) {
    if (unidad && Number(unidad.f) > 0) return { tipo: 'valor', valor: Number(unidad.f) };
    const tieneDesgaste = !!(item && item.wear);
    return { tipo: tieneDesgaste ? 'consultar' : 'ninguno', valor: null };
  }

  function resolver(unidades, catalogo, cfg, ahora, opciones) {
    const incluirSinPrecio = !!(opciones && opciones.incluirSinPrecio);
    const porId = {};
    for (const it of (catalogo || [])) porId[String(it.id)] = it;
    const t = ahora || Date.now();
    const c = cfg || configActual();
    const salida = [];
    for (const u of (unidades || [])) {
      const original = porId[u.i];
      const it = original && u.z ? Object.assign({}, original, {
        market_hash_name: conFase(original.market_hash_name, u.z),
        youpin_price_usd: null, final_price_usdt: 0,
      }) : original;
      const conPrecio = !!it && (u.p != null || Number(u.y) > 0 || Number(it.youpin_price_usd) > 0 || Number(it.final_price_usdt) > 0);
      if (!conPrecio) {
        if (!incluirSinPrecio) continue;
        salida.push(Object.assign({}, it || { market_hash_name: '(ya no está en el catálogo)' }, {
          inventario: true, unidad: u, id: u.u, item_id: u.i, float: u.f,
          estado_float: estadoFloat(u, it), stock: u.n || 1,
          precio: null, final_price_usdt: 0,
          sin_precio: it ? 'catalogo_viejo' : 'fuera_del_catalogo',
        }));
        continue;
      }
      const precio = precioDe(u, it, c, t);
      salida.push(Object.assign({}, it, {
        inventario: true,
        unidad: u,
        id: u.u,
        item_id: String(it.id),
        float: u.f,
        estado_float: estadoFloat(u, it),
        stock: u.n || 1,
        precio: precio,
        final_price_usdt: precio.total,
      }));
    }
    return salida;
  }

  window.JotaInventario = {
    CONFIG_DEFECTO: CONFIG_DEFECTO,
    aplicarConfig: aplicarConfig,
    configActual: configActual,
    parsearCsv: parsearCsv,
    cruzar: cruzar,
    conservarAjustes: conservarAjustes,
    precioDe: precioDe,
    factorFloat: factorFloat,
    limpiarRangos: limpiarRangos,
    RANGOS_FLOAT: RANGOS_FLOAT,
    MAX_TRAMOS: MAX_TRAMOS,
    diasDeLock: diasDeLock,
    empaquetar: empaquetar,
    desempaquetar: desempaquetar,
    resolver: resolver,
    estadoFloat: estadoFloat,
    normalizarNombre: normalizarNombre,
    COLS: COLS,
  };
})();
