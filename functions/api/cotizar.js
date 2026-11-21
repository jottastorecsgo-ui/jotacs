import { json, leerCuerpo, revisarOrigen, responderError, rechazar, quienEs, cuentaDeServicio, tokenDeServicio, firmar } from '../../lib/servidor.js';
import { leerPedido, armarOrden, VIGENCIA_MS } from '../../lib/pedido.js';

const MAX_COTIZACIONES = 30;

export async function onRequestGet({ env }) {
  return json({ servidor: !!cuentaDeServicio(env), dominios: !!String(env.DOMINIOS || '').trim() });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!cuentaDeServicio(env)) return json({ error: 'sin-config' }, 503);
    revisarOrigen(request, env);
    const cuerpo = await leerCuerpo(request);
    const ahora = Date.now();
    const quien = await quienEs(cuerpo.idToken, ahora);
    if (!quien.email || !quien.verificado) {
      rechazar(403, 'mail', 'Tu cuenta no tiene el mail verificado, así que no podemos registrar la orden. Entrá con Google o escribinos por Instagram.');
    }
    if (env.AVISOS) {
      const clave = 'c:' + quien.uid + ':' + Math.floor(ahora / 600000);
      const n = (Number(await env.AVISOS.get(clave)) || 0) + 1;
      if (n > MAX_COTIZACIONES) rechazar(429, 'ritmo', 'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.');
      await env.AVISOS.put(clave, String(n), { expirationTtl: 1200 });
    }
    const pedido = leerPedido(cuerpo);
    const token = await tokenDeServicio(env);
    const orden = await armarOrden(token, quien, pedido, ahora);
    const vence = ahora + VIGENCIA_MS;
    const cotizacion = await firmar(env, { orden, vence });
    return json({ orden, vence, cotizacion });
  } catch (e) {
    return responderError(e, 'cotizar');
  }
}
