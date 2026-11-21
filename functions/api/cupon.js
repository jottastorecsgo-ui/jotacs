import { json, leerCuerpo, revisarOrigen, responderError, rechazar, quienEs, cuentaDeServicio, tokenDeServicio, ordenesDe, guardar, ritmo } from '../../lib/servidor.js';
import { cuponComun } from '../../lib/pedido.js';

const CUPON = /^[A-Z0-9_-]{2,32}$/;

export async function onRequestPost({ request, env }) {
  try {
    if (!cuentaDeServicio(env)) return json({ error: 'sin-config' }, 503);
    revisarOrigen(request, env);
    const cuerpo = await leerCuerpo(request);
    const ahora = Date.now();
    const quien = await quienEs(cuerpo.idToken, ahora);
    const codigo = String(cuerpo.codigo || '').trim().toUpperCase();
    if (!CUPON.test(codigo) || codigo.startsWith('JP-')) rechazar(400, 'cupon', 'Código no válido.');
    await ritmo(env, 'k:' + quien.uid, 15, 600000, 'Probaste demasiados códigos seguidos. Esperá unos minutos.');
    await ritmo(env, 'kd:' + quien.uid, 60, 86400000, 'Probaste demasiados códigos hoy. Probá mañana.');
    const subtotal = Number(cuerpo.subtotal);
    const token = await tokenDeServicio(env);
    const cupon = await cuponComun(token, codigo, subtotal > 0 ? subtotal : 0, await ordenesDe(token, quien.uid), ahora);
    await guardar(token, 'config/seguridad', { cupones_directos: false }).catch(() => false);
    return json(cupon);
  } catch (e) {
    return responderError(e, 'cupon');
  }
}
