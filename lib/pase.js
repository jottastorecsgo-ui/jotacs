import './ventana.js';
import '../assets/js/battlepass.js';
import { leer, listar } from './servidor.js';

export const Pase = globalThis.JotaPase;
const DESFASE = 3 * 3600000;

function correr(v) {
  if (v == null || v === '') return v;
  const t = v instanceof Date ? v.getTime() : (typeof v === 'string' ? Date.parse(v) : NaN);
  return isFinite(t) ? new Date(t - DESFASE).toISOString() : v;
}

export const ahoraArgentina = (ms) => new Date(ms - DESFASE);

export function ordenesArgentina(ordenes) {
  return (ordenes || []).map(o => Object.assign({}, o, { created_at: correr(o.created_at) }));
}

function fichaArgentina(ficha, reclamos) {
  const f = Object.assign({}, ficha || {});
  const pase = {};
  for (const id of Object.keys(f.pase || {})) {
    const t = f.pase[id] || {};
    const cuando = {};
    for (const n of Object.keys(t.cuando || {})) cuando[n] = correr(t.cuando[n]);
    pase[id] = Object.assign({}, t, { cuando, hh_hasta: correr(t.hh_hasta) });
  }
  f.pase = pase;
  f._reclamos = (reclamos || []).map(r => Object.assign({}, r, { cuando: correr(r.cuando) }));
  return f;
}

export async function fichaDelPase(token, uid) {
  const [cfg, ficha, reclamos] = await Promise.all([
    leer(token, 'config/battlepass'), leer(token, 'users/' + uid), listar(token, 'users/' + uid + '/reclamos'),
  ]);
  if (cfg) Pase.aplicarConfig(cfg);
  return fichaArgentina(ficha, reclamos);
}
