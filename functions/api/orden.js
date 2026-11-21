import { json, leerCuerpo, revisarOrigen, responderError, rechazar, quienEs, cuentaDeServicio, tokenDeServicio, abrirFirmado, ordenesDe, crear, guardar, leer } from '../../lib/servidor.js';
import { revisarLimites, revisarStock, revisarCupon } from '../../lib/pedido.js';

const LETRAS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const sufijo = (bytes) => Array.from(bytes, b => LETRAS[b % 36]).join('');
const dia = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

export async function onRequestPost({ request, env }) {
  try {
    if (!cuentaDeServicio(env)) return json({ error: 'sin-config' }, 503);
    revisarOrigen(request, env);
    const cuerpo = await leerCuerpo(request);
    const ahora = Date.now();
    const quien = await quienEs(cuerpo.idToken, ahora);
    const firmado = await abrirFirmado(env, cuerpo.cotizacion);
    if (!firmado || !firmado.orden || firmado.orden.user_uid !== quien.uid) rechazar(400, 'cotizacion', 'No pudimos validar la orden. Volvé a confirmarla.');

    const token = await tokenDeServicio(env);
    const orden = firmado.orden;
    const huella = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(cuerpo.cotizacion))));
    const propio = 'JOTA-' + dia(Number(firmado.vence)) + '-' + sufijo(huella.slice(0, 6));
    const ya = await leer(token, 'orders/' + propio);
    if (ya && ya.user_uid === quien.uid) return json({ orderId: propio, total_usdt: ya.total_usdt, total_ars: ya.total_ars, repetida: true });

    if (!(Number(firmado.vence) > ahora)) rechazar(410, 'vencida', 'Pasó mucho tiempo desde que armaste la orden. Volvé a confirmarla para ver el total al día.');
    const suyas = await ordenesDe(token, quien.uid);
    await revisarLimites(token, quien, suyas, ahora);
    await revisarStock(token, orden, ahora);
    await revisarCupon(token, orden, suyas, ahora);

    let orderId = '';
    const candidatos = ya ? [] : [propio];
    for (let i = 0; i < 3; i++) candidatos.push('JOTA-' + dia(ahora) + '-' + sufijo(crypto.getRandomValues(new Uint8Array(6))));
    for (const id of candidatos) {
      if (await crear(token, 'orders/' + id, Object.assign({ order_id: id }, orden), 'created_at')) { orderId = id; break; }
      if (id === propio) {
        const otra = await leer(token, 'orders/' + propio);
        if (otra && otra.user_uid === quien.uid) return json({ orderId: propio, total_usdt: otra.total_usdt, total_ars: otra.total_ars, repetida: true });
      }
    }
    if (!orderId) throw new Error('no se pudo elegir un id libre');

    await guardar(token, 'config/seguridad', { ordenes_directas: false }).catch(() => false);
    return json({ orderId, total_usdt: orden.total_usdt, total_ars: orden.total_ars });
  } catch (e) {
    return responderError(e, 'orden');
  }
}
