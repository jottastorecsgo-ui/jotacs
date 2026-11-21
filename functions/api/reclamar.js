import { json, leerCuerpo, revisarOrigen, responderError, rechazar, quienEs, cuentaDeServicio, tokenDeServicio, ordenesDe, crear, guardar, ritmo } from '../../lib/servidor.js';
import { Pase, fichaDelPase, ordenesArgentina, ahoraArgentina } from '../../lib/pase.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!cuentaDeServicio(env)) return json({ error: 'sin-config' }, 503);
    revisarOrigen(request, env);
    const cuerpo = await leerCuerpo(request);
    const ahora = Date.now();
    const quien = await quienEs(cuerpo.idToken, ahora);
    const nivel = Number(cuerpo.nivel);
    const eleccion = cuerpo.eleccion == null || cuerpo.eleccion === '' ? null : String(cuerpo.eleccion);
    if (!Number.isInteger(nivel) || nivel < 1 || nivel > 50) rechazar(400, 'nivel', 'Ese nivel no existe.');
    await ritmo(env, 'r:' + quien.uid, 30, 600000);

    const token = await tokenDeServicio(env);
    const [ficha, ordenes] = await Promise.all([fichaDelPase(token, quien.uid), ordenesDe(token, quien.uid)]);
    const l = Pase.nivelPorNumero(nivel);
    if (!l) rechazar(400, 'nivel', 'Ese nivel no existe.');
    if (l.opciones && !l.opciones.some(o => o.id === eleccion)) rechazar(400, 'eleccion', 'Elegí una de las recompensas del nivel.');
    const estado = Pase.estadoDe(ficha, ordenesArgentina(ordenes), quien.uid, ahoraArgentina(ahora));
    if (estado.reclamados.indexOf(nivel) !== -1) rechazar(409, 'reclamado', 'Ese nivel ya está reclamado.');
    if (!Pase.puedeReclamar(nivel, estado.jp, estado.pase)) rechazar(403, 'bloqueado', 'Todavía no llegaste a ese nivel.');

    const temp = estado.temporada.id;
    const datos = { temp, nivel, eleccion: l.opciones ? eleccion : null };
    if (!await crear(token, 'users/' + quien.uid + '/reclamos/' + temp + '_' + nivel, datos, 'cuando')) {
      rechazar(409, 'reclamado', 'Ese nivel ya está reclamado.');
    }
    await guardar(token, 'config/seguridad', { reclamos_directos: false }).catch(() => false);
    return json(Object.assign({ ok: true }, datos));
  } catch (e) {
    return responderError(e, 'reclamar');
  }
}
