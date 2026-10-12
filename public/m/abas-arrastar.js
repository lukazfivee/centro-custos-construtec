// Barra de abas como a do iPhone: ao tocar, a pilula vira uma lente de vidro que cresce e acompanha o dedo,
// estica com a velocidade e balanca ao parar (mola); ao soltar, encaixa na aba mais proxima e abre essa aba.
// A lente refrata o que esta embaixo (filtro SVG #abas-lente, so nos navegadores Chromium, como o app Android;
// no iPhone a lente aparece sem refracao). Toque simples continua sendo o clique do botao.
(function () {
  // Mapa de deslocamento: vermelho varia na horizontal e verde na vertical (meio = parado). O miolo fica quase
  // neutro e as bordas puxam para dentro: o que passa perto da borda da lente entorta e aumenta, como vidro grosso.
  const MAPA = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>"
    + "<defs><linearGradient id='r'><stop offset='0' stop-color='#f00'/><stop offset='1' stop-color='#000'/></linearGradient>"
    + "<linearGradient id='g' x2='0' y2='1'><stop offset='0' stop-color='#0f0'/><stop offset='1' stop-color='#000'/></linearGradient>"
    + "<filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='5'/></filter></defs>"
    + "<rect width='100' height='100' fill='url(#r)'/><rect width='100' height='100' fill='url(#g)' style='mix-blend-mode:screen'/>"
    + "<rect x='8' y='10' width='84' height='80' rx='34' fill='#808000' opacity='.92' filter='url(#b)'/></svg>";
  const REFRATA = /Chrome\/|Chromium\//.test(navigator.userAgent) && !/CriOS|EdgiOS/.test(navigator.userAgent);
  const CALMO = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function filtroLente() {
    if (document.getElementById('abas-lente')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = '<filter id="abas-lente" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">'
      + `<feImage href="data:image/svg+xml,${encodeURIComponent(MAPA)}" preserveAspectRatio="none" result="mapa"/>`
      + '<feDisplacementMap in="SourceGraphic" in2="mapa" scale="16" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.appendChild(svg);
  }

  window.arrastarAbas = function (nav, onPick) {
    let drag = null;
    let settleTimer;
    let swallowUntil = 0;
    // Mola da deformacao: s e o quanto a lente estica (negativo = achata), sv a velocidade da mola.
    let s = 0, sv = 0, vel = 0, lastX = 0, lastT = 0, raf = 0;
    if (REFRATA) { filtroLente(); nav.classList.add('refrata'); }
    const tabs = () => Array.from(nav.querySelectorAll('.tab'));
    const geometry = () => {
      const r = nav.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(nav).paddingLeft) || 0;
      const n = Math.max(1, tabs().length);
      return { left: r.left + pad, cell: (r.width - pad * 2) / n, n };
    };
    const spring = () => {
      if (performance.now() - lastT > 40) vel *= 0.5; // dedo parado: a velocidade some e a lente volta balancando
      const target = Math.min(Math.abs(vel) * 0.18, 0.24);
      sv = (sv + (target - s) * 0.3) * 0.8;
      s += sv;
      nav.style.setProperty('--stretch', s.toFixed(4));
      if (drag && (Math.abs(s) > 0.002 || Math.abs(sv) > 0.002 || Math.abs(vel) > 0.01)) raf = requestAnimationFrame(spring);
      else { raf = 0; s = sv = vel = 0; nav.style.setProperty('--stretch', '0'); }
    };
    const stopSpring = () => { cancelAnimationFrame(raf); raf = 0; s = sv = vel = 0; nav.style.setProperty('--stretch', '0'); };
    const place = (clientX) => {
      const { left, cell, n } = drag.g;
      const x = Math.min(Math.max(clientX - left - cell / 2, 0), cell * (n - 1));
      nav.style.setProperty('--drag-x', `${x}px`);
      if (drag.moved && !CALMO) {
        const now = performance.now();
        vel = vel * 0.5 + ((clientX - lastX) / Math.max(1, now - lastT)) * 0.5;
        lastX = clientX;
        lastT = now;
        if (!raf) raf = requestAnimationFrame(spring);
      }
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
      lastX = e.clientX;
      lastT = performance.now();
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
      stopSpring();
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
