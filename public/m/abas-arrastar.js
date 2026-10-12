// Barra de abas como a do iPhone: ao tocar, a pilula vira uma lente que cresce e acompanha o dedo;
// ao soltar, encaixa na aba mais proxima e abre essa aba. Toque simples continua sendo o clique do botao.
(function () {
  window.arrastarAbas = function (nav, onPick) {
    let drag = null;
    let settleTimer;
    let swallowUntil = 0;
    const tabs = () => Array.from(nav.querySelectorAll('.tab'));
    const geometry = () => {
      const r = nav.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(nav).paddingLeft) || 0;
      const n = Math.max(1, tabs().length);
      return { left: r.left + pad, cell: (r.width - pad * 2) / n, n };
    };
    const place = (clientX) => {
      const { left, cell, n } = drag.g;
      const x = Math.min(Math.max(clientX - left - cell / 2, 0), cell * (n - 1));
      nav.style.setProperty('--drag-x', `${x}px`);
      const idx = Math.round(x / cell);
      if (idx === drag.idx) return;
      drag.idx = idx;
      tabs().forEach((b, i) => b.classList.toggle('is-lens', i === idx));
      if (drag.moved && navigator.vibrate) { try { navigator.vibrate(6); } catch { /* sem vibracao */ } }
    };

    nav.addEventListener('pointerdown', (e) => {
      if (drag || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !e.target.closest('.tab')) return;
      clearTimeout(settleTimer);
      nav.classList.remove('is-settling');
      drag = { id: e.pointerId, x0: e.clientX, moved: false, idx: -1, g: geometry() };
      place(e.clientX);
      nav.classList.add('is-pressed');
    });
    nav.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < 8) return;
        drag.moved = true;
        nav.classList.add('is-dragging');
        try { nav.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
      }
      place(e.clientX);
    });
    const end = (e, cancel) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { moved, idx } = drag;
      drag = null;
      nav.classList.remove('is-pressed', 'is-dragging');
      nav.classList.add('is-settling');
      settleTimer = setTimeout(() => nav.classList.remove('is-settling'), 420);
      tabs().forEach((b) => b.classList.remove('is-lens'));
      if (!moved) return; // toque simples: o clique do botao abre a aba
      swallowUntil = performance.now() + 400;
      const target = tabs()[idx];
      if (!cancel && target && target.getAttribute('aria-current') !== 'page') onPick(target.dataset.go);
    };
    nav.addEventListener('pointerup', (e) => end(e, false));
    nav.addEventListener('pointercancel', (e) => end(e, true));
    // Depois de arrastar, o clique que o navegador ainda manda nao abre outra aba.
    nav.addEventListener('click', (e) => { if (performance.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
    nav.addEventListener('contextmenu', (e) => e.preventDefault());
  };
})();
