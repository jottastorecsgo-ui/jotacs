(function () {
  const IDS = ['a1','a2','a3','a4','a5','a6','a7','a8','a9'];

  const FONDOS = {
    a1:'#D0ECAF', a2:'#E2C8F8', a3:'#FFC99A',
    a4:'#C2DCFD', a5:'#FBE3B3', a6:'#FDC1CB',
    a7:'#CCF7EE', a8:'#DEBFEB', a9:'#FDC2BC',
  };

  const NOMBRES = {
    a1:'Comandante', a2:'Ava',      a3:'Fénix',
    a4:'Cazador',    a5:'Veterano', a6:'Miami',
    a7:'McCoy',      a8:'Agente CT', a9:'Agente T',
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const valido = (id) => IDS.includes(id) ? id : null;

  const aleatorio = () => IDS[Math.floor(Math.random() * IDS.length)];

  function porUid(uid) {
    const s = String(uid || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return IDS[h % IDS.length];
  }

  function iniciales(nombre) {
    const base = String(nombre || '').trim();
    if (!base) return '?';
    const partes = base.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
    return partes.map(p => p[0].toUpperCase()).join('') || '?';
  }

  const src = (id) => 'assets/img/avatares/' + id + '.jpeg';

  function html(id, nombre, clase) {
    const a = valido(id) || porUid(nombre);
    const fondo = FONDOS[a];
    return `<span class="jav ${clase || ''}" style="background:${fondo}">`
      + `<i class="jav-ini">${esc(iniciales(nombre))}</i>`
      + `<img src="${src(a)}" alt="" loading="lazy" decoding="async"`
      + ` onerror="this.remove()">`
      + `</span>`;
  }

  const LLAVE = 'jota_avatar_v1';
  function recordar(uid, id) {
    if (!uid || !valido(id)) return;
    try { localStorage.setItem(LLAVE, JSON.stringify({ uid, id })); } catch(_) {}
  }
  function recordado(uid) {
    try {
      const d = JSON.parse(localStorage.getItem(LLAVE) || 'null');
      return (d && d.uid === uid && valido(d.id)) ? d.id : null;
    } catch(_) { return null; }
  }
  const deUsuario = (uid) => recordado(uid) || porUid(uid);

  window.JotaAvatar = { IDS, FONDOS, NOMBRES, valido, aleatorio, porUid,
                        recordar, recordado, deUsuario, iniciales, src, html, esc };
})();
