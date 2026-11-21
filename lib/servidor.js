export const PROYECTO = 'jota-store';
export const BASE = 'projects/' + PROYECTO + '/databases/(default)/documents';
export const DOCS = 'https://firestore.googleapis.com/v1/' + BASE;
const CLAVES_GOOGLE = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TOKEN_GOOGLE = 'https://oauth2.googleapis.com/token';
export const MAX_CUERPO = 32 * 1024;

export const json = (o, status) => new Response(JSON.stringify(o), {
  status: status || 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  },
});

export class Rechazo extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje || codigo);
    this.status = status;
    this.codigo = codigo;
    this.mensaje = mensaje || '';
  }
}

export const rechazar = (status, codigo, mensaje) => { throw new Rechazo(status, codigo, mensaje); };

export function responderError(e, donde) {
  if (e instanceof Rechazo) return json({ error: e.codigo, mensaje: e.mensaje }, e.status);
  console.warn('[' + donde + '] ' + (e && e.message));
  return json({ error: 'interno', mensaje: 'No pudimos procesar el pedido. Probá de nuevo en un momento.' }, 500);
}

export async function leerCuerpo(request) {
  const texto = await request.text();
  if (texto.length > MAX_CUERPO) rechazar(413, 'muy-grande', 'El pedido es demasiado grande.');
  try {
    const d = JSON.parse(texto);
    if (d && typeof d === 'object' && !Array.isArray(d)) return d;
  } catch (_) {}
  return rechazar(400, 'invalido', 'Pedido inválido.');
}

export function revisarOrigen(request, env) {
  const permitidos = String(env.DOMINIOS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!permitidos.length) return;
  const host = new URL(request.url).hostname.toLowerCase();
  if (!permitidos.includes(host)) rechazar(403, 'dominio', 'Pedido no permitido.');
  const origen = request.headers.get('Origin');
  if (origen) {
    let h = '';
    try { h = new URL(origen).hostname.toLowerCase(); } catch (_) {}
    if (!permitidos.includes(h)) rechazar(403, 'dominio', 'Pedido no permitido.');
  }
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s) => {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - t.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const utf8 = (s) => new TextEncoder().encode(s);
const deUtf8 = (b) => new TextDecoder().decode(b);

let clavesGoogle = null;
async function clavesDeGoogle() {
  if (clavesGoogle && clavesGoogle.hasta > Date.now()) return clavesGoogle.keys;
  const r = await fetch(CLAVES_GOOGLE);
  if (!r.ok) throw new Error('claves de Google ' + r.status);
  const d = await r.json();
  clavesGoogle = { keys: Array.isArray(d.keys) ? d.keys : [], hasta: Date.now() + 3600000 };
  return clavesGoogle.keys;
}

export async function quienEs(idToken, ahora) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3 || idToken.length > 5000) rechazar(401, 'sesion', 'Iniciá sesión de nuevo.');
  let cabeza, datos;
  try {
    cabeza = JSON.parse(deUtf8(deB64url(partes[0])));
    datos = JSON.parse(deUtf8(deB64url(partes[1])));
  } catch (_) { rechazar(401, 'sesion', 'Iniciá sesión de nuevo.'); }
  if (cabeza.alg !== 'RS256' || !cabeza.kid) rechazar(401, 'sesion', 'Iniciá sesión de nuevo.');
  const jwk = (await clavesDeGoogle()).find(k => k.kid === cabeza.kid);
  if (!jwk) rechazar(401, 'sesion', 'Iniciá sesión de nuevo.');
  const clave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const firmaOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, deB64url(partes[2]), utf8(partes[0] + '.' + partes[1]));
  const seg = Math.floor((ahora || Date.now()) / 1000);
  if (!firmaOk || datos.aud !== PROYECTO || datos.iss !== 'https://securetoken.google.com/' + PROYECTO
      || !(Number(datos.exp) > seg) || !(Number(datos.iat) <= seg + 300) || !datos.sub || typeof datos.sub !== 'string') {
    rechazar(401, 'sesion', 'Iniciá sesión de nuevo.');
  }
  return {
    uid: datos.sub,
    email: typeof datos.email === 'string' ? datos.email : '',
    verificado: datos.email_verified === true,
    nombre: typeof datos.name === 'string' ? datos.name.slice(0, 120) : '',
    foto: typeof datos.picture === 'string' && /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[A-Za-z0-9_.\/=%~+-]*$/.test(datos.picture) && datos.picture.length <= 500 ? datos.picture : '',
  };
}

export function cuentaDeServicio(env) {
  try {
    const c = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '');
    if (c && c.client_email && c.private_key) return c;
  } catch (_) {}
  return null;
}

const pemADer = (pem) => {
  const limpio = String(pem).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(limpio);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

let tokenServicio = null;
export async function tokenDeServicio(env) {
  const cuenta = cuentaDeServicio(env);
  if (!cuenta) rechazar(503, 'sin-config', '');
  if (tokenServicio && tokenServicio.de === cuenta.client_email && tokenServicio.hasta > Date.now() + 60000) return tokenServicio.token;
  const seg = Math.floor(Date.now() / 1000);
  const cabeza = b64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const cuerpo = b64url(utf8(JSON.stringify({
    iss: cuenta.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: TOKEN_GOOGLE, iat: seg, exp: seg + 3600,
  })));
  const clave = await crypto.subtle.importKey('pkcs8', pemADer(cuenta.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, utf8(cabeza + '.' + cuerpo)));
  const r = await fetch(TOKEN_GOOGLE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + cabeza + '.' + cuerpo + '.' + firma,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.access_token) throw new Error('token de servicio ' + r.status);
  tokenServicio = { de: cuenta.client_email, token: d.access_token, hasta: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tokenServicio.token;
}

async function claveDeFirma(env) {
  const cuenta = cuentaDeServicio(env);
  const semilla = await crypto.subtle.digest('SHA-256', utf8('jota-cotizacion|' + cuenta.private_key));
  return crypto.subtle.importKey('raw', semilla, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function firmar(env, datos) {
  const cuerpo = b64url(utf8(JSON.stringify(datos)));
  const firma = b64url(await crypto.subtle.sign('HMAC', await claveDeFirma(env), utf8(cuerpo)));
  return cuerpo + '.' + firma;
}

export async function abrirFirmado(env, texto) {
  const partes = String(texto || '').split('.');
  if (partes.length !== 2) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await claveDeFirma(env), deB64url(partes[1]), utf8(partes[0])); } catch (_) { ok = false; }
  if (!ok) return null;
  try { return JSON.parse(deUtf8(deB64url(partes[0]))); } catch (_) { return null; }
}

export function valor(v) {
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

export function aREST(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aREST) } };
  const fields = {};
  for (const k of Object.keys(v)) fields[k] = aREST(v[k]);
  return { mapValue: { fields } };
}

const ruta = (r) => r.split('/').map(encodeURIComponent).join('/');
const cabeceras = (token) => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const documento = (d) => valor({ mapValue: { fields: (d && d.fields) || {} } });

export async function leer(token, r) {
  const res = await fetch(DOCS + '/' + ruta(r), { headers: cabeceras(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('leer ' + r + ' ' + res.status);
  const d = await res.json();
  return d && d.fields ? documento(d) : {};
}

export async function leerVarios(token, rutas) {
  const unicas = [...new Set(rutas)];
  if (!unicas.length) return {};
  const res = await fetch(DOCS + ':batchGet', {
    method: 'POST', headers: cabeceras(token),
    body: JSON.stringify({ documents: unicas.map(r => BASE + '/' + r) }),
  });
  if (!res.ok) throw new Error('leerVarios ' + res.status);
  const filas = await res.json();
  const out = {};
  for (const f of Array.isArray(filas) ? filas : []) {
    if (f && f.found && f.found.name) out[f.found.name.slice(f.found.name.indexOf('/documents/') + 11)] = documento(f.found);
  }
  return out;
}

export async function listar(token, coleccion) {
  const out = [];
  let pagina = '';
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const res = await fetch(DOCS + '/' + ruta(coleccion) + '?pageSize=300' + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''), { headers: cabeceras(token) });
    if (!res.ok) throw new Error('listar ' + coleccion + ' ' + res.status);
    const d = await res.json();
    for (const x of d.documents || []) out.push(documento(x));
    pagina = d.nextPageToken || '';
    if (!pagina) break;
  }
  return out;
}

async function consultar(token, consulta) {
  const res = await fetch(DOCS + ':runQuery', {
    method: 'POST', headers: cabeceras(token),
    body: JSON.stringify({ structuredQuery: consulta }),
  });
  if (!res.ok) throw new Error('consulta ' + res.status);
  const filas = await res.json();
  const out = [];
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || !f.document) continue;
    out.push(Object.assign(documento(f.document), { id: f.document.name.split('/').pop() }));
  }
  return out;
}

export function ordenesRecientes(token, desdeMs) {
  return consultar(token, {
    from: [{ collectionId: 'orders' }],
    where: { fieldFilter: { field: { fieldPath: 'created_at' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: new Date(desdeMs).toISOString() } } },
    select: { fields: ['status', 'items', 'inventario_descontado', 'created_at'].map(f => ({ fieldPath: f })) },
    limit: 2000,
  });
}

export function ordenesConCupon(token, codigo) {
  return consultar(token, {
    from: [{ collectionId: 'orders' }],
    where: { fieldFilter: { field: { fieldPath: 'discount_code' }, op: 'EQUAL', value: { stringValue: codigo } } },
    select: { fields: ['status', 'cupon_contado', 'created_at'].map(f => ({ fieldPath: f })) },
    limit: 2000,
  });
}

export async function ordenesDe(token, uid) {
  const res = await fetch(DOCS + ':runQuery', {
    method: 'POST', headers: cabeceras(token),
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: { fieldFilter: { field: { fieldPath: 'user_uid' }, op: 'EQUAL', value: { stringValue: uid } } },
      select: { fields: ['status', 'created_at', 'total_usdt', 'total_ars', 'usdt_ars_rate', 'discount_code'].map(f => ({ fieldPath: f })) },
      limit: 1000,
    } }),
  });
  if (!res.ok) throw new Error('ordenesDe ' + res.status);
  const filas = await res.json();
  const out = [];
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || !f.document) continue;
    out.push(Object.assign(documento(f.document), { id: f.document.name.split('/').pop() }));
  }
  return out;
}

export async function crear(token, r, datos, conFechaEn) {
  const res = await fetch(DOCS + ':commit', {
    method: 'POST', headers: cabeceras(token),
    body: JSON.stringify({ writes: [{
      update: { name: BASE + '/' + r, fields: aREST(datos).mapValue.fields },
      currentDocument: { exists: false },
      updateTransforms: conFechaEn ? [{ fieldPath: conFechaEn, setToServerValue: 'REQUEST_TIME' }] : [],
    }] }),
  });
  if (res.status === 409 || res.status === 400) {
    const t = await res.text().catch(() => '');
    if (res.status === 409 || /ALREADY_EXISTS/.test(t)) return false;
    throw new Error('crear ' + r + ' ' + res.status);
  }
  if (!res.ok) throw new Error('crear ' + r + ' ' + res.status);
  return true;
}

export async function guardar(token, r, datos) {
  const campos = Object.keys(datos);
  const res = await fetch(DOCS + '/' + ruta(r) + '?' + campos.map(c => 'updateMask.fieldPaths=' + encodeURIComponent(c)).join('&'), {
    method: 'PATCH', headers: cabeceras(token),
    body: JSON.stringify({ fields: aREST(datos).mapValue.fields }),
  });
  return res.ok;
}

export async function cotizacionDelDolar() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch('https://criptoya.com/api/usdt/ars/0.1', { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return 0;
    const d = await r.json();
    let v = Number(d && d.binancep2p && d.binancep2p.ask);
    if (!(v > 0)) {
      const otras = ['lemoncash', 'buenbit', 'letsbit', 'belo'].map(k => Number(d && d[k] && d[k].ask)).filter(x => x > 0);
      v = otras.length ? otras.reduce((a, b) => a + b, 0) / otras.length : 0;
    }
    return v > 0 && v <= 5000 ? v : 0;
  } catch (_) { return 0; }
}

export async function ritmo(env, clave, tope, ventanaMs, mensaje) {
  if (!env.AVISOS) return;
  const k = clave + ':' + Math.floor(Date.now() / ventanaMs);
  const n = (Number(await env.AVISOS.get(k)) || 0) + 1;
  if (n > tope) rechazar(429, 'ritmo', mensaje || 'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.');
  await env.AVISOS.put(k, String(n), { expirationTtl: Math.max(60, Math.ceil(ventanaMs * 2 / 1000)) });
}
