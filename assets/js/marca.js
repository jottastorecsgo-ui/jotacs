(function () {
  'use strict';

  function seParte(header, logo) {
    const base = logo.getBoundingClientRect();
    return [...header.children].some(e => {
      if (e === logo || e.classList.contains('mobile-nav') || e.offsetParent === null) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.top >= base.bottom - 4;
    });
  }

  function ajustar() {
    const texto = document.querySelector('.logo-texto');
    const logo = texto && texto.closest('.logo-lockup');
    const header = logo && logo.closest('header');
    if (!header) return;
    texto.classList.remove('compacta', 'oculta');
    if (!seParte(header, logo)) return;
    texto.classList.add('compacta');
    if (!seParte(header, logo)) return;
    texto.classList.remove('compacta');
    texto.classList.add('oculta');
  }

  let espera = null;
  function pedir() {
    clearTimeout(espera);
    espera = setTimeout(ajustar, 60);
  }

  function medir() {
    const h = document.querySelector('header');
    if (h) document.documentElement.style.setProperty('--alto-header', h.offsetHeight + 'px');
  }

  ajustar();
  medir();
  window.addEventListener('resize', pedir);
  window.addEventListener('load', () => { ajustar(); medir(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ajustar(); medir(); });
  const header = document.querySelector('header');
  if (header && window.MutationObserver) {
    new MutationObserver(pedir).observe(header, { childList: true, subtree: true, characterData: true });
  }
  if (header && window.ResizeObserver) new ResizeObserver(medir).observe(header);
  else window.addEventListener('resize', medir);
})();
