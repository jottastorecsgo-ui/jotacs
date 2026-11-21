import './ventana.js';
import '../assets/js/inventario.js';
import '../assets/js/pagos.js';
import { rechazar, leer, leerVarios, ordenesDe, ordenesRecientes, ordenesConCupon, cotizacionDelDolar } from './servidor.js';
import { Pase, fichaDelPase, ordenesArgentina, ahoraArgentina } from './pase.js';

const Inventario = globalThis.JotaInventario;
const Pagos = globalThis.JotaPagos;
export const RESERVA_MS = 48 * 3600000;
const ESPERANDO = ['pending_payment', 'payment_submitted'];

async function reservadas(token, ahora) {
  const out = {};
  for (const o of await ordenesRecientes(token, ahora - RESERVA_MS)) {
    if (!ESPERANDO.includes(o.status) || o.inventario_descontado) continue;
    for (const l of Array.isArray(o.items) ? o.items : []) {
      if (!l || !l.inventario || !l.unidad_id) continue;
      out[l.unidad_id] = (out[l.unidad_id] || 0) + Math.max(1, Math.floor(Number(l.qty) || 1));
    }
  }
  return out;
}

const SIN_STOCK = 'Una skin de inventario del carrito ya no está disponible o está reservada en otra orden. Actualizá la página.';

export const MAX_LINEAS = 100;
export const MAX_UNIDADES = 100;
export const MAX_POR_ITEM = 3;
export const MAX_PENDIENTES = 5;
export const MAX_POR_DIA = 15;
export const VIGENCIA_MS = 30 * 60 * 1000;
const OCULTAS = ['sticker', 'patch', 'graffiti'];
const ID_ITEM = /^[A-Za-z0-9_.-]{1,40}$/;
const ID_UNIDAD = /^[A-Za-z0-9_.:-]{1,120}$/;
const TRADE_URL = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/[A-Za-z0-9?=&_%+.~\/-]*$/;
const CUPON = /^[A-Z0-9_-]{2,32}$/;
const CONTACTOS = ['whatsapp', 'instagram', 'facebook'];
const dos = (n) => Number((Number(n) || 0).toFixed(2));

export function leerPedido(d) {
  const lineas = Array.isArray(d.items) ? d.items : [];
  if (!lineas.length || lineas.length > MAX_LINEAS) rechazar(400, 'items', 'El carrito está vacío o tiene demasiados items.');
  const vistos = new Set();
  const items = lineas.map(l => {
    const inventario = !!(l && l.inventario);
    const id = String(l && l.id != null ? l.id : '');
    const qty = Number(l && l.qty);
    if (!(inventario ? ID_UNIDAD : ID_ITEM).test(id) || !Number.isInteger(qty) || qty < 1 || qty > MAX_POR_ITEM || vistos.has(id)) {
      rechazar(400, 'items', 'Hay un item del carrito que no se puede pedir. Actualizá la página.');
    }
    vistos.add(id);
    return { id, qty, inventario };
  });
  if (items.reduce((s, i) => s + i.qty, 0) > MAX_UNIDADES) rechazar(400, 'items', 'Máximo ' + MAX_UNIDADES + ' items por orden.');

  const tradeUrl = String(d.tradeUrl || '');
  if (tradeUrl.length > 300 || !TRADE_URL.test(tradeUrl)) rechazar(400, 'trade', 'La Trade URL no parece válida.');
  const c = d.contacto || {};
  const tipo = String(c.tipo || '');
  const dato = String(c.valor || '').trim();
  if (!CONTACTOS.includes(tipo) || !dato || dato.length > 120) rechazar(400, 'contacto', 'Revisá tu dato de contacto.');
  const metodo = String(d.metodo || '');
  const cupon = d.cupon == null || d.cupon === '' ? null : String(d.cupon).trim().toUpperCase();
  if (cupon && !CUPON.test(cupon)) rechazar(400, 'cupon', 'Código no válido.');
  const cot = Number(d.cotizacion);
  return {
    items, tradeUrl, contacto: { tipo, valor: dato }, metodo, cupon,
    vista: d.vista === 'ARS' ? 'ARS' : 'USDT',
    cotizacion: cot > 0 && cot <= 5000 ? cot : 0,
  };
}

export async function revisarLimites(token, quien, ordenes, ahora) {
  if (await leer(token, 'blacklist/' + quien.email) || (quien.email !== quien.email.toLowerCase() && await leer(token, 'blacklist/' + quien.email.toLowerCase()))) {
    rechazar(403, 'bloqueado', 'No se pudo crear la orden. Escribinos por Instagram.');
  }
  const pendientes = ordenes.filter(o => o.status === 'pending_payment').length;
  if (pendientes >= MAX_PENDIENTES) {
    rechazar(429, 'pendientes', 'Tenés ' + pendientes + ' órdenes esperando pago. Cancelá las que no vayas a pagar desde Mi cuenta o esperá a que las confirmemos.');
  }
  const hoy = ordenes.filter(o => ahora - Date.parse(o.created_at || '') < 86400000).length;
  if (hoy >= MAX_POR_DIA) rechazar(429, 'por-dia', 'Llegaste al máximo de órdenes por día. Escribinos por Instagram.');
}

async function preciarItems(token, items, ahora) {
  const deInventario = items.filter(i => i.inventario);
  let unidades = [];
  let cfg = null;
  if (deInventario.length) {
    const [inv, c] = await Promise.all([leer(token, 'inventario/items'), leer(token, 'config/inventario')]);
    try { unidades = Inventario.desempaquetar(JSON.parse((inv && inv.data) || '[]')); } catch (_) { unidades = []; }
    cfg = Inventario.aplicarConfig(c || {});
  }
  const porUnidad = {};
  for (const u of unidades) porUnidad[u.u] = u;
  const enOtras = deInventario.length ? await reservadas(token, ahora) : {};

  const ids = [];
  for (const i of items) {
    if (!i.inventario) { ids.push(i.id); continue; }
    const u = porUnidad[i.id];
    if (!u || (u.n || 1) - (enOtras[i.id] || 0) < i.qty) rechazar(409, 'sin-stock', SIN_STOCK);
    if (ID_ITEM.test(String(u.i))) ids.push(String(u.i));
  }
  const precios = await leerVarios(token, ids.map(id => 'prices/' + id));
  const catalogo = Object.keys(precios).map(r => Object.assign({}, precios[r], { id: r.split('/').pop() }))
    .filter(it => !OCULTAS.includes(it.category));
  const porId = {};
  for (const it of catalogo) porId[it.id] = it;

  return items.map(i => {
    let it, unidad = null;
    if (i.inventario) {
      unidad = porUnidad[i.id];
      it = Inventario.resolver([unidad], catalogo, cfg, ahora)[0];
    } else {
      it = porId[i.id];
    }
    const precio = Number(it && it.final_price_usdt);
    if (!it || !(precio > 0)) rechazar(409, 'no-disponible', 'Un item del carrito ya no está disponible. Actualizá la página.');
    const costo = unidad && Number(unidad.y) > 0 ? Number(unidad.y) : (Number(it.youpin_price_usd) > 0 ? Number(it.youpin_price_usd) : null);
    return {
      item_id: i.id,
      market_hash_name: String(it.market_hash_name || ''),
      image: String(it.image_url || ''),
      wear: it.wear || null,
      rarity: it.rarity || '',
      is_stattrak: it.is_stattrak === true,
      category: it.category || '',
      qty: i.qty,
      unit_price_usdt: precio,
      subtotal_usdt: dos(precio * i.qty),
      cost_usd: costo,
      inventario: i.inventario,
      unidad_id: i.inventario ? i.id : null,
    };
  });
}

export async function cuponComun(token, codigo, subtotal, ordenes, ahora) {
  const c = await leer(token, 'discount_codes/' + codigo);
  if (!c || c.active === false) rechazar(400, 'cupon', 'Código no válido.');
  if (c.expires_at && Date.parse(c.expires_at) < ahora) rechazar(400, 'cupon', 'Este código expiró.');
  if (typeof c.max_uses === 'number') {
    let usos = Number(c.uses_count) || 0;
    if (usos < c.max_uses) {
      for (const o of await ordenesConCupon(token, codigo)) {
        if (!ESPERANDO.includes(o.status) || o.cupon_contado) continue;
        if (o.status === 'payment_submitted' || ahora - Date.parse(o.created_at || '') < RESERVA_MS) usos++;
      }
    }
    if (usos >= c.max_uses) rechazar(400, 'cupon', 'Este código ya alcanzó el máximo de usos.');
  }
  if (typeof c.min_purchase_usdt === 'number' && subtotal < c.min_purchase_usdt) {
    rechazar(400, 'cupon', 'Necesitás un mínimo de $' + c.min_purchase_usdt.toFixed(2) + ' USDT para usar este código.');
  }
  if (typeof c.min_delivered_orders === 'number' && c.min_delivered_orders > 0) {
    const entregadas = ordenes.filter(o => o.status === 'delivered').length;
    if (entregadas < c.min_delivered_orders) rechazar(400, 'cupon', 'Este código es para clientes con al menos ' + c.min_delivered_orders + ' compra(s) entregada(s).');
  }
  const tipo = c.type || 'percent';
  const v = Number(c.value);
  if (!isFinite(v) || v <= 0 || (tipo === 'percent' && v >= 100) || (tipo !== 'percent' && tipo !== 'fixed')) rechazar(400, 'cupon', 'Código no válido.');
  return { code: codigo, type: tipo, value: v, minimo_usdt: typeof c.min_purchase_usdt === 'number' ? c.min_purchase_usdt : 0 };
}

async function descuentoComun(token, codigo, subtotal, ordenes, ahora) {
  const c = await cuponComun(token, codigo, subtotal, ordenes, ahora);
  return c.type === 'percent' ? subtotal * c.value / 100 : Math.min(c.value, subtotal);
}

async function descuentoDelPase(token, codigo, subtotal, quien, ordenes, cot, ahora) {
  const f = await fichaDelPase(token, quien.uid);
  const r = Pase.revisarCupon(f, ordenesArgentina(ordenes), quien.uid, codigo, ahoraArgentina(ahora));
  if (!r.cupon) rechazar(400, 'cupon', 'Código no válido.');
  if (r.motivo) rechazar(400, 'cupon', 'Este cupón ' + r.motivo + '.');
  const otra = ordenes.find(o => o.discount_code === codigo && o.status !== 'cancelled');
  if (otra) rechazar(400, 'cupon', 'Este cupón ya está en tu orden ' + otra.id + '.');
  if (!(cot > 0)) rechazar(409, 'cotizacion', 'No hay cotización del dólar en este momento. Probá en un rato.');
  if (subtotal * cot < r.cupon.minimo) rechazar(400, 'cupon', 'Este cupón pide una compra de al menos $' + Math.round(r.cupon.minimo).toLocaleString('es-AR') + ' ARS.');
  const v = Math.round((r.cupon.pesos / cot) * 100) / 100;
  if (!(v > 0) || v >= subtotal) rechazar(400, 'cupon', 'Este cupón no se puede usar con este carrito.');
  return v;
}

export async function armarOrden(token, quien, pedido, ahora) {
  const ordenes = await ordenesDe(token, quien.uid);
  await revisarLimites(token, quien, ordenes, ahora);

  const pagos = await leer(token, 'config/pagos');
  const lista = Pagos.normalizar(pagos && pagos.metodos);
  const metodo = (lista.length ? lista : Pagos.base()).find(m => m.id === pedido.metodo && m.activo);
  if (!metodo) rechazar(400, 'metodo', 'Ese método de pago ya no está disponible. Elegí otro.');
  const enPesos = metodo.moneda === 'ARS';

  const items = await preciarItems(token, pedido.items, ahora);
  const subtotal = dos(items.reduce((s, i) => s + i.subtotal_usdt, 0));

  const delPase = !!pedido.cupon && pedido.cupon.startsWith('JP-');
  const cot = await cotizacionDelDolar();
  if ((enPesos || delPase) && !(cot > 0)) rechazar(409, 'cotizacion', 'No pudimos obtener la cotización del dólar. Probá en un rato o elegí pagar en USDT.');

  let descuento = 0;
  if (pedido.cupon) {
    descuento = delPase
      ? await descuentoDelPase(token, pedido.cupon, subtotal, quien, ordenes, cot, ahora)
      : await descuentoComun(token, pedido.cupon, subtotal, ordenes, ahora);
  }
  descuento = dos(descuento);
  const total = dos(Math.max(0, subtotal - descuento));
  if (!(total > 0) || descuento >= subtotal) rechazar(400, 'total', 'El total no puede ser cero.');
  if (total >= 100000) rechazar(400, 'total', 'El total supera el límite permitido.');

  const orden = {
    user_uid: quien.uid,
    user_email: quien.email,
    user_name: quien.nombre,
    user_photo: quien.foto,
    items,
    subtotal_usdt: subtotal,
    discount_code: pedido.cupon,
    discount_usdt: descuento,
    total_usdt: total,
    total_ars: enPesos ? Math.round(total * cot) : null,
    usdt_ars_rate: cot > 0 ? cot : null,
    currency_view: pedido.vista,
    pay_currency: enPesos ? 'ARS' : 'USDT',
    trade_url: pedido.tradeUrl,
    payment_method: metodo.id,
    contact_type: pedido.contacto.tipo,
    contact_value: pedido.contacto.valor,
    status: 'pending_payment',
    por_servidor: true,
  };
  if (!Pagos.esFijo(metodo.id)) orden.payment_label = metodo.nombre;
  return orden;
}

export async function revisarStock(token, orden, ahora) {
  const lineas = orden.items.filter(i => i.inventario);
  if (!lineas.length) return;
  const [inv, enOtras] = await Promise.all([leer(token, 'inventario/items'), reservadas(token, ahora)]);
  let unidades = [];
  try { unidades = Inventario.desempaquetar(JSON.parse((inv && inv.data) || '[]')); } catch (_) { unidades = []; }
  for (const l of lineas) {
    const u = unidades.find(x => x.u === l.unidad_id);
    if (!u || (u.n || 1) - (enOtras[l.unidad_id] || 0) < l.qty) rechazar(409, 'sin-stock', 'Una skin de inventario de tu orden se acaba de vender o la reservó otro cliente. Actualizá la página.');
  }
}

export async function revisarCupon(token, orden, ordenes, ahora) {
  const codigo = orden.discount_code;
  if (!codigo) return;
  if (codigo.startsWith('JP-')) {
    if (ordenes.some(o => o.discount_code === codigo && o.status !== 'cancelled')) {
      rechazar(409, 'cupon', 'Ese cupón ya está en otra orden tuya. Volvé a confirmar la compra.');
    }
    return;
  }
  try {
    await cuponComun(token, codigo, orden.subtotal_usdt, ordenes, ahora);
  } catch (e) {
    if (e && e.status === 400) rechazar(409, 'cupon', 'El cupón ' + codigo + ' ya no se puede usar: ' + String(e.mensaje || '').replace(/^./, c => c.toLowerCase()) + ' Volvé a confirmar la compra.');
    throw e;
  }
}
