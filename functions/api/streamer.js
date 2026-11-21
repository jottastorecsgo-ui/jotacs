const DOCS = 'https://firestore.googleapis.com/v1/projects/jota-store/databases/(default)/documents';
const ID_VALIDO = /^JOTA-[0-9]{8}-[0-9A-Z]{4,8}$/;
const CODIGO_VALIDO = /^[A-Z0-9_-]{2,32}$/;
const CHAT_VALIDO = /^-?[0-9]{4,20}$/;

const json = (o, status) => new Response(JSON.stringify(o), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestPost(context) {
  const { request, env } = context;
  let datos = null;
  try { datos = await request.json(); } catch (_) {}
  const idToken = datos && String(datos.idToken || '');
  if (!idToken || idToken.length > 5000) return new Response('pedido inválido', { status: 400 });

  if (datos.prueba) {
    const codigo = String(datos.codigo || '');
    if (!CODIGO_VALIDO.test(codigo)) return new Response('pedido inválido', { status: 400 });
    const resultado = await probarStreamer(env, codigo, idToken).catch(() => 'error');
    return json({ resultado });
  }

  const orderId = String(datos.orderId || '');
  if (!ID_VALIDO.test(orderId)) return new Response('pedido inválido', { status: 400 });
  context.waitUntil(avisarStreamer(env, orderId, idToken)
    .then(r => console.log('[streamer] ' + orderId + ': ' + r))
    .catch(e => console.warn('[streamer] ' + orderId + ' falló:', e && e.message)));
  return new Response(null, { status: 202 });
}

export async function probarStreamer(env, codigo, idToken) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return 'sin-config';
  const chat = await chatDe(codigo, idToken);
  if (!chat) return 'sin-chat';
  const ok = await mandar(token, chat, '<b>Listo</b>\nAcá te van a llegar los avisos de cada compra con tu código ' + esc(codigo) + '.');
  return ok ? 'ok' : 'telegram';
}

export async function avisarStreamer(env, orderId, idToken) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return 'sin-config';

  const orden = await leer('orders/' + encodeURIComponent(orderId), idToken);
  if (!orden) return 'no-encontrada';
  if (orden.status !== 'paid' && orden.status !== 'delivered') return 'no-pagada';
  const codigo = String(orden.discount_code || '');
  if (!CODIGO_VALIDO.test(codigo) || codigo.startsWith('JP-')) return 'sin-codigo';

  const chat = await chatDe(codigo, idToken);
  if (!chat) return 'sin-chat';

  if (env.AVISOS) {
    const clave = 'streamer:' + orderId;
    if (await env.AVISOS.get(clave)) return 'repetida';
    await env.AVISOS.put(clave, '1', { expirationTtl: 30 * 86400 });
  }

  const ventas = await ventasDe(codigo, idToken);
  return (await mandar(token, chat, armarAviso(orden, codigo, ventas))) ? 'ok' : 'telegram';
}

export function armarAviso(o, codigo, ventas) {
  const items = Array.isArray(o.items) ? o.items.filter(Boolean) : [];
  const cantidad = items.reduce((s, it) => s + (Number(it.qty) || 1), 0);
  const enPesos = Number(o.total_ars) > 0 ? Number(o.total_ars)
    : (Number(o.usdt_ars_rate) > 0 ? Number(o.total_usdt) * Number(o.usdt_ars_rate) : 0);
  const lineas = [
    '<b>Nueva compra con tu código ' + esc(codigo) + '</b>',
    '',
    'Total: ' + usd(o.total_usdt) + ' USDT' + (enPesos ? ' (~' + ars(enPesos) + ' ARS)' : ''),
    'Skins: ' + cantidad,
  ];
  if (ventas) {
    lineas.push('', 'Con tu código ya van ' + ventas.n + (ventas.n === 1 ? ' compra' : ' compras') + ' por ' + usd(ventas.total) + ' USDT.');
  }
  return lineas.join('\n');
}

async function chatDe(codigo, idToken) {
  const st = await leer('streamers/' + encodeURIComponent(codigo), idToken);
  const chat = st && String(st.chat || '');
  return chat && CHAT_VALIDO.test(chat) ? chat : '';
}

async function leer(ruta, idToken) {
  let r;
  try { r = await fetch(DOCS + '/' + ruta, { headers: { Authorization: 'Bearer ' + idToken } }); }
  catch (_) { return null; }
  if (!r.ok) return null;
  const doc = await r.json().catch(() => null);
  if (!doc || !doc.fields) return null;
  return valor({ mapValue: { fields: doc.fields } });
}

async function ventasDe(codigo, idToken) {
  let r;
  try {
    r = await fetch(DOCS + ':runQuery', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: { fieldFilter: { field: { fieldPath: 'discount_code' }, op: 'EQUAL', value: { stringValue: codigo } } },
        select: { fields: [{ fieldPath: 'status' }, { fieldPath: 'total_usdt' }] },
      } }),
    });
  } catch (_) { return null; }
  if (!r.ok) return null;
  const filas = await r.json().catch(() => null);
  if (!Array.isArray(filas)) return null;
  let n = 0, total = 0;
  for (const f of filas) {
    if (!f || !f.document) continue;
    const o = valor({ mapValue: { fields: f.document.fields || {} } });
    if (o.status !== 'paid' && o.status !== 'delivered') continue;
    n++;
    total += Number(o.total_usdt) || 0;
  }
  return { n, total };
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

async function mandar(token, chat, texto) {
  let r;
  try {
    r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (_) { return false; }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.warn('[streamer] Telegram respondió ' + r.status + ': ' + (j && j.description || ''));
    return false;
  }
  return true;
}
