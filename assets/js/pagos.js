(function () {
  'use strict';

  const PROJ = 'projects/jota-store/databases/(default)/documents';
  const KEY = 'AIzaSyC2h9G0Z-2kMnzpm9njmbgvh8CDJVsIW8k';
  const GUARDADO = 'jota_pagos_v1';
  const FIJOS = ['usdt_bep20', 'binance_pay', 'mercadopago', 'prex_uy'];
  const SKINS = 'skins';
  const GLOBAL66 = 'global66';
  const LOGOS = {
    usdt_bep20: 'assets/img/shared/usdt.webp',
    binance_pay: 'assets/img/shared/binance-pay.webp',
    mercadopago: 'assets/img/shared/mercadopago.webp',
    prex_uy: 'assets/img/shared/prex.webp',
    global66: 'assets/img/shared/global66.webp',
  };
  const ICONO_SKINS = '<svg class="pago-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 3 9.5 13.5l1 1L21 4z"/><path d="M9.5 13.5 4 19l1 1 5.5-5.5"/><path d="M8 16l-1.5-1.5"/></svg>';
  const MAX_METODOS = 10;
  const MAX_FILAS = 10;

  const BASE = [
    { id: 'usdt_bep20', nombre: 'USDT BEP-20', detalle: 'Red BSC · sin comisión', moneda: 'USDT', activo: true, filas: [
      { etiqueta: 'Red', valor: 'BSC (BEP-20)', copiar: false },
      { etiqueta: 'Dirección USDT', valor: 'xxxxxx', copiar: true },
      { etiqueta: 'Importante', valor: 'Enviar solo USDT por red BSC. Otras redes se pierden.', copiar: false },
    ] },
    { id: 'binance_pay', nombre: 'Binance Pay', detalle: 'Instantáneo entre cuentas Binance', moneda: 'USDT', activo: true, filas: [
      { etiqueta: 'Binance Pay ID', valor: 'xxxxxx', copiar: true },
      { etiqueta: 'Importante', valor: 'Pago instantáneo dentro de Binance, sin comisión.', copiar: false },
    ] },
    { id: 'mercadopago', nombre: 'Mercado Pago / Transferencia ARS', detalle: 'Cotización al momento de pago', moneda: 'ARS', activo: true, filas: [
      { etiqueta: 'CVU', valor: '0000000000000000000000', copiar: true },
      { etiqueta: 'Alias', valor: 'jota.store', copiar: true },
      { etiqueta: 'Titular', valor: 'JOTA STORE', copiar: false },
      { etiqueta: 'Importante', valor: 'Cotización fijada al confirmar la orden.', copiar: false },
    ] },
    { id: 'prex_uy', nombre: 'Prex Uruguay', detalle: 'Transferencia entre cuentas Prex', moneda: 'USDT', activo: true, filas: [
      { etiqueta: 'Prex Uruguay', valor: 'xxxxxx', copiar: true },
      { etiqueta: 'Titular', valor: 'JOTA STORE', copiar: false },
      { etiqueta: 'Importante', valor: 'Transferencia entre cuentas Prex, sin comisión.', copiar: false },
    ] },
    { id: GLOBAL66, nombre: 'Global66', detalle: 'Transferencia desde tu cuenta Global66', moneda: 'USDT', activo: true, filas: [
      { etiqueta: 'Cuenta Global66', valor: 'xxxxxx', copiar: true },
      { etiqueta: 'Titular', valor: 'JOTA STORE', copiar: false },
    ] },
    { id: SKINS, nombre: 'Skins + otro método', detalle: 'Pagá una parte con tus skins', moneda: 'USDT', activo: true, filas: [
      { etiqueta: 'Cómo sigue', valor: 'Creá la orden y escribinos por Instagram o Facebook con el número de orden. Vemos tus skins, te decimos cuánto cubren y cómo pagás el resto.', copiar: false },
    ] },
  ];

  const texto = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const idValido = (id) => FIJOS.indexOf(id) !== -1 || id === SKINS || id === GLOBAL66 || /^m_[a-z0-9]{4,12}$/.test(id);

  function icono(id) {
    if (id === SKINS) return ICONO_SKINS;
    return LOGOS[id] ? '<img class="pago-ico" src="' + LOGOS[id] + '" alt="" width="16" height="16" loading="lazy">' : '';
  }

  function normalizar(lista) {
    const vistos = {};
    const salida = [];
    for (const m of Array.isArray(lista) ? lista : []) {
      if (!m || typeof m !== 'object') continue;
      const id = texto(m.id, 20);
      const nombre = texto(m.nombre, 40);
      if (!idValido(id) || vistos[id] || !nombre) continue;
      vistos[id] = true;
      const filas = [];
      for (const f of Array.isArray(m.filas) ? m.filas : []) {
        if (!f || typeof f !== 'object') continue;
        const etiqueta = texto(f.etiqueta, 40);
        const valor = texto(f.valor, 200);
        if (!etiqueta && !valor) continue;
        filas.push({ etiqueta: etiqueta, valor: valor, copiar: f.copiar === true });
        if (filas.length >= MAX_FILAS) break;
      }
      salida.push({
        id: id,
        nombre: nombre,
        detalle: texto(m.detalle, 80),
        moneda: m.moneda === 'ARS' ? 'ARS' : 'USDT',
        activo: m.activo !== false,
        filas: filas,
      });
      if (salida.length >= MAX_METODOS) break;
    }
    return salida;
  }

  let actuales = normalizar(BASE);

  function leerValor(f) {
    if (!f || typeof f !== 'object') return null;
    if ('stringValue' in f) return f.stringValue;
    if ('booleanValue' in f) return f.booleanValue;
    if ('integerValue' in f) return Number(f.integerValue);
    if ('doubleValue' in f) return f.doubleValue;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(leerValor);
    if ('mapValue' in f) {
      const o = {};
      const campos = f.mapValue.fields || {};
      for (const k in campos) o[k] = leerValor(campos[k]);
      return o;
    }
    return null;
  }

  function usar(lista) {
    const ok = normalizar(lista);
    if (ok.length) actuales = ok;
    return actuales;
  }

  function cargar() {
    return fetch('https://firestore.googleapis.com/v1/' + PROJ + '/config/pagos?key=' + KEY)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(d => {
        const lista = normalizar(d && d.fields ? leerValor(d.fields.metodos) : null);
        if (!lista.length) throw new Error('sin métodos');
        actuales = lista;
        try { localStorage.setItem(GUARDADO, JSON.stringify(lista)); } catch (_) {}
        return actuales;
      })
      .catch(() => {
        try {
          const g = normalizar(JSON.parse(localStorage.getItem(GUARDADO) || 'null'));
          if (g.length) actuales = g;
        } catch (_) {}
        return actuales;
      });
  }

  const metodo = (id) => actuales.find(m => m.id === id) || null;

  function filas(id) {
    const m = metodo(id);
    return m ? m.filas.map(f => ({ label: f.etiqueta, value: f.valor, copy: f.copiar })) : [];
  }

  function nombre(id, guardado) {
    const m = metodo(id);
    if (m) return m.nombre;
    if (guardado) return guardado;
    const b = BASE.find(x => x.id === id);
    return b ? b.nombre : (id || '');
  }

  function direccionBEP20() {
    const m = metodo('usdt_bep20');
    const fila = m && m.filas.find(f => /^0x[0-9a-fA-F]{40}$/.test(f.valor));
    return fila ? fila.valor : '';
  }

  function nuevoId() {
    let id = '';
    do {
      id = 'm_' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
    } while (id.length < 6 || metodo(id));
    return id;
  }

  window.JotaPagos = {
    FIJOS: FIJOS,
    MAX_METODOS: MAX_METODOS,
    MAX_FILAS: MAX_FILAS,
    base: () => normalizar(BASE),
    normalizar: normalizar,
    usar: usar,
    cargar: cargar,
    metodos: () => actuales.slice(),
    activos: () => actuales.filter(m => m.activo),
    metodo: metodo,
    filas: filas,
    nombre: nombre,
    esFijo: (id) => FIJOS.indexOf(id) !== -1,
    esSkins: (id) => id === SKINS,
    icono: icono,
    SKINS: SKINS,
    direccionBEP20: direccionBEP20,
    nuevoId: nuevoId,
  };
})();
