const PROYECTO = 'jota-store';
const MAX_EDAD_MS = 10 * 60 * 1000;
const MAX_ITEMS = 15;
const MAX_TEXTO = 4000;
const ID_VALIDO = /^JOTA-[0-9]{8}-[0-9A-Z]{4,8}$/;
const ID_ITEM = /^[A-Za-z0-9_.:-]{1,80}$/;
const MAX_POR_HORA = 20;
const MAX_ALERTAS = 8;
const ESPERA_PRECIOS_MS = 4000;

export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    funcion: 'ok',
    token_cargado: !!env.TELEGRAM_BOT_TOKEN,
    chat_cargado: !!env.TELEGRAM_CHAT_ID,
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let datos = null;
  try { datos = await request.json(); } catch (_) {}
  const orderId = datos && String(datos.orderId || '');
  const idToken = datos && String(datos.idToken || '');
  if (!ID_VALIDO.test(orderId) || !idToken || idToken.length > 5000) {
    return new Response('pedido inválido', { status: 400 });
  }
  context.waitUntil(avisarOrden(env, orderId, idToken)
    .then(r => console.log('[aviso] ' + orderId + ': ' + r))
    .catch(e => console.warn('[aviso] ' + orderId + ' falló:', e && e.message)));
  return new Response(null, { status: 202 });
}

export async function avisarOrden(env, orderId, idToken, ahora) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return 'sin-config';

  const orden = await leerOrden(orderId, idToken);
  if (!orden) return 'no-encontrada';
  const creada = Date.parse(orden.created_at || '');
  const hoy = ahora || Date.now();
  if (!(creada > 0) || hoy - creada > MAX_EDAD_MS || creada - hoy > 60000) return 'vieja';
  if (orden.status !== 'pending_payment') return 'no-pendiente';

  if (env.AVISOS) {
    if (await env.AVISOS.get(orderId)) return 'repetida';
    await env.AVISOS.put(orderId, '1', { expirationTtl: 86400 });
    const uid = String(orden.user_uid || '');
    if (uid) {
      const clave = 'u:' + uid + ':' + Math.floor(hoy / 3600000);
      const n = (Number(await env.AVISOS.get(clave)) || 0) + 1;
      await env.AVISOS.put(clave, String(n), { expirationTtl: 7200 });
      if (n > MAX_POR_HORA) {
        if (n === MAX_POR_HORA + 1) {
          await mandar(token, chat, '<b>Muchas órdenes seguidas</b>\n' + esc(orden.user_name || '—') + ' (' + esc(orden.user_email || '—')
            + ') ya creó ' + MAX_POR_HORA + ' órdenes en esta hora. Las próximas no se avisan por acá: están en el panel.');
        }
        return 'demasiadas';
      }
    }
  }

  const alertas = await Promise.race([
    alertasDePrecio(orden, idToken).catch(() => []),
    new Promise(listo => setTimeout(() => listo([]), ESPERA_PRECIOS_MS)),
  ]);
  const mensajes = armarMensajes(orden, alertas);
  for (const texto of mensajes) await mandar(token, chat, texto);
  return 'ok';
}

export async function alertasDePrecio(o, idToken) {
  const out = [];
  const items = Array.isArray(o.items) ? o.items.filter(x => x && typeof x === 'object') : [];
  const conPrecio = items.length > 0 && items.every(it => typeof it.unit_price_usdt === 'number');
  if (conPrecio) {
    const suma = items.reduce((s, it) => s + it.unit_price_usdt * (Number(it.qty) || 1), 0);
    const sub = Number(o.subtotal_usdt);
    if (isFinite(sub) && Math.abs(suma - sub) > 0.05 + items.length * 0.01) {
      out.push('los items suman ' + usd(suma) + ' y el subtotal dice ' + usd(sub));
    }
  }
  const tot = Number(o.total_usdt) || 0;
  const pesos = Number(o.total_ars);
  const cot = Number(o.usdt_ars_rate);
  if (pesos > 0 && cot > 0 && pesos < tot * cot * 0.99 - 1) {
    out.push('el total en pesos es menor al que da la cotización de la orden');
  }

  const pedidos = [];
  for (const it of items) {
    if (it.inventario || typeof it.unit_price_usdt !== 'number') continue;
    const id = String(it.item_id == null ? '' : it.item_id);
    if (!ID_ITEM.test(id)) { out.push(nombreItem(it) + ': no se pudo ubicar en la lista de precios'); continue; }
    pedidos.push({ id, it });
  }
  if (!pedidos.length) return out;

  const base = 'projects/' + PROYECTO + '/databases/(default)/documents';
  let r;
  try {
    r = await fetch('https://firestore.googleapis.com/v1/' + base + ':batchGet', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: [...new Set(pedidos.map(p => base + '/prices/' + p.id))] }),
    });
  } catch (_) { return out; }
  if (!r.ok) return out;
  const filas = await r.json().catch(() => null);
  if (!Array.isArray(filas)) return out;
  const precios = {};
  for (const f of filas) {
    if (!f || !f.found || !f.found.name) continue;
    precios[f.found.name.split('/').pop()] = valor({ mapValue: { fields: f.found.fields || {} } });
  }
  const limpio = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  for (const { id, it } of pedidos) {
    const p = precios[id];
    if (!p) { out.push(nombreItem(it) + ': no está en la lista de precios'); continue; }
    if (limpio(p.market_hash_name) !== limpio(it.market_hash_name)) {
      out.push(nombreItem(it) + ': el nombre no coincide con la lista de precios (' + limpio(p.market_hash_name) + ')');
    }
    const hoy = Number(p.final_price_usdt) || 0;
    if (hoy > 0 && it.unit_price_usdt < hoy * 0.9 - 0.01) {
      out.push(nombreItem(it) + ': figura a ' + usd(it.unit_price_usdt) + ' y hoy vale ' + usd(hoy));
    }
  }
  return out;
}

async function leerOrden(orderId, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO
    + '/databases/(default)/documents/orders/' + encodeURIComponent(orderId);
  let r;
  try { r = await fetch(url, { headers: { Authorization: 'Bearer ' + idToken } }); }
  catch (_) { return null; }
  if (!r.ok) { console.warn('[aviso] Firestore respondió ' + r.status + ' al leer ' + orderId); return null; }
  const doc = await r.json().catch(() => null);
  if (!doc || !doc.fields) return null;
  return valor({ mapValue: { fields: doc.fields } });
}

function valor(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor);
  if ('mapValue' in v) {
    const out = {};
    const f = v.mapValue.fields || {};
    for (const k of Object.keys(f)) out[k] = valor(f[k]);
    return out;
  }
  return null;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const usd = (n) => '$' + (Number(n) || 0).toFixed(2);
const ars = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const copiable = (s) => '<code>' + esc(s) + '</code>';

const GEMAS = [['ruby_marbleized', 'Ruby'], ['sapphire_marbleized', 'Sapphire'], ['blackpearl_marbleized', 'Black Pearl'], ['emerald_marbleized', 'Emerald']];

function faseDe(it) {
  if (!it || !/Doppler/.test(String(it.market_hash_name || ''))) return '';
  const u = String(it.image || it.image_url || '');
  const m = /_doppler_phase([1-4])(?:_|$)/.exec(u);
  if (m) return 'Fase ' + m[1];
  const g = GEMAS.find(x => u.includes('_am_' + x[0]));
  return g ? g[1] : '';
}

function nombreItem(it) {
  const nombre = String((it && (it.market_hash_name || it.name)) || 'Item sin nombre');
  const fase = faseDe(it);
  return fase ? nombre + ' · ' + fase : nombre;
}

function floatDe(it) {
  if (!it || !it.inventario || !it.unidad_id) return null;
  const f = Number(String(it.unidad_id).split(':')[1]);
  return f > 0 && f < 1 ? f.toFixed(10).replace(/0+$/, '') : null;
}

export function armarMensajes(o, alertas) {
  const items = Array.isArray(o.items) ? o.items.filter(Boolean) : [];
  const enPesos = Number(o.total_ars) > 0 ? Number(o.total_ars)
    : (Number(o.usdt_ars_rate) > 0 ? Number(o.total_usdt) * Number(o.usdt_ars_rate) : 0);

  const cabeza = [
    '<b>Orden nueva ' + copiable(o.order_id) + '</b>',
    '',
    'Total: ' + usd(o.total_usdt) + ' USDT' + (enPesos ? ' (~' + ars(enPesos) + ' ARS)' : ''),
  ];
  const avisos = Array.isArray(alertas) ? alertas.filter(Boolean) : [];
  if (avisos.length) {
    cabeza.splice(1, 0, '', '<b>⚠ Revisar antes de entregar:</b>',
      ...avisos.slice(0, MAX_ALERTAS).map(a => '• ' + esc(String(a).slice(0, 220))),
      ...(avisos.length > MAX_ALERTAS ? ['• y ' + (avisos.length - MAX_ALERTAS) + ' más'] : []));
  }
  if (o.discount_code) {
    cabeza.push('Cupón: ' + esc(o.discount_code) + ' (−' + usd(o.discount_usdt) + ')');
  }
  cabeza.push('Pago: ' + esc(o.payment_label || o.payment_method || '—') + (o.pay_currency === 'ARS' ? ' (en pesos)' : ''));
  cabeza.push('Cliente: ' + esc(o.user_name || '—') + ' (' + esc(o.user_email || '—') + ')');
  cabeza.push('Contacto: ' + esc(o.contact_type || '') + ' ' + copiable(o.contact_value || '—'));
  cabeza.push('Trade link:');
  cabeza.push(copiable(o.trade_url || '—'));

  const lista = items.map(it => '• ' + esc(nombreItem(it))
    + (it.inventario ? ' [inventario]' : '')
    + ' x' + (Number(it.qty) || 1) + ' — ' + usd(it.subtotal_usdt));
  const pie = items.length ? ['', 'Abajo va cada uno en su mensaje, para copiar.'] : [];

  let principal = cabeza.concat(['', items.length + ' item(s):'], lista, pie).join('\n');
  if (principal.length > MAX_TEXTO) {
    principal = cabeza.concat(['', items.length + ' item(s): la lista va abajo.']).join('\n');
  }

  const mensajes = [principal];
  const mostrar = items.slice(0, MAX_ITEMS);
  mostrar.forEach((it, i) => {
    const f = floatDe(it);
    mensajes.push(
      esc(o.order_id) + ' · item ' + (i + 1) + ' de ' + items.length + '\n'
      + copiable(nombreItem(it)) + '\n'
      + (f ? 'Float: ' + copiable(f) + '\n' : '')
      + 'x' + (Number(it.qty) || 1) + ' — ' + usd(it.subtotal_usdt) + ' USDT');
  });
  if (items.length > MAX_ITEMS) {
    mensajes.push('Hay ' + (items.length - MAX_ITEMS) + ' item(s) más: verlos en el panel.');
  }
  return mensajes;
}

async function mandar(token, chat, texto, reintento) {
  let r;
  try {
    r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) { console.warn('[aviso] sin red con Telegram'); return false; }
  if (r.status === 429 && !reintento) {
    const j = await r.json().catch(() => ({}));
    const espera = Math.min(5, Number(j && j.parameters && j.parameters.retry_after) || 1);
    await new Promise(ok => setTimeout(ok, espera * 1000));
    return mandar(token, chat, texto, true);
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.warn('[aviso] Telegram respondió ' + r.status + ': ' + (j && j.description || ''));
    return false;
  }
  return true;
}
