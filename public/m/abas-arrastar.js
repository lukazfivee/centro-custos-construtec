// Barra de abas como a do iPhone (Liquid Glass do iOS 26).
// Vidro: no tamanho real da barra e da pilula, gera o mapa de refracao (bisel convexo + lei de Snell; so Chromium,
// via backdrop-filter: url()) e o mapa de brilho (aro de luz conforme a normal da borda; Chromium e iPhone, como
// fundo CSS). Gesto: ao tocar, a pilula vira lente, segue o dedo, estica com a velocidade (mola) e encaixa na aba
// mais proxima ao soltar. Toque simples continua sendo o clique do botao.
(function () {
  // Refracao so no Chromium: no WebKit (Safari, PWA, WKWebView) um url() no backdrop-filter apaga o efeito inteiro.
  // GestureEvent so existe no WebKit da Apple: protege um WKWebView com user agent que diga "Chrome/".
  const REFRATA = /Chrome\/|Chromium\//.test(navigator.userAgent) && !/CriOS|EdgiOS|FxiOS/.test(navigator.userAgent) && typeof GestureEvent === 'undefined';
  const CALMO = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = 128; // amostras do perfil do bisel
  // Ajustes do vidro, em px CSS. Refracao: bisel, espessura, indice; forca multiplica o desvio. Brilho: luz em graus
  // (90 = de cima, 180 = da esquerda), fracao no lado oposto, largura e base do aro, faixa e forca da luz no bisel,
  // franja colorida (dispersao pintada; so onde nao ha refracao de verdade).
  const BARRA = { bisel: 16, espessura: 16, ior: 1.5, forca: 0.8, luz: 120, oposto: 0.45, aro: 1, base: 0.3, faixa: 10, bisLuz: 0.1, franja: 0 };
  const LENTE = { bisel: 14, espessura: 10, ior: 1.5, forca: 1, luz: 120, oposto: 0.5, aro: 1.25, base: 0.35, faixa: 10, bisLuz: 0.16, franja: REFRATA ? 0 : 0.16 };

  // Desvio lateral (px) do raio que desce pelo vidro em cada profundidade x = i/N do bisel (0 = borda, 1 = miolo plano).
  // Superficie squircle convexa y = (1 - (1 - x)^4)^(1/4) e refracao de Snell (mesma conta do refract do GLSL).
  function perfilBisel(bisel, espessura, ior) {
    const alt = (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25);
    const eta = 1 / ior, out = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const x = i / N, a = Math.max(0, x - 1e-4), b = Math.min(1, x + 1e-4);
      const s = (alt(b) - alt(a)) / (b - a), m = Math.hypot(s, 1), nx = -s / m, ny = -1 / m;
      const k = 1 - eta * eta * (1 - ny * ny);
      if (k < 0) continue;
      const c = eta * ny + Math.sqrt(k);
      out[i] = (-c * nx) * (alt(x) * bisel + espessura) / (eta - c * ny);
    }
    return out;
  }

  // Percorre os pixels de um mapa W x H (px CSS, capsula de raio R) na densidade dpr. Para cada pixel a menos de
  // 'faixa' px da borda, chama f(dados, i, prof, nx, ny, px): prof = distancia ate a borda (positiva dentro, pela
  // distancia com sinal da capsula), (nx, ny) = normal para fora, px = tamanho do pixel em px CSS. O miolo fica com 'fundo'.
  function varrer(W, H, R, dpr, faixa, fundo, f) {
    const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr)), sx = W / w, sy = H / h;
    const data = new Uint8ClampedArray(w * h * 4), hx = W / 2 - R, hy = H / 2 - R, miolo = H / 2 - faixa;
    for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = fundo[0]; data[i + 3] = fundo[1]; }
    for (let py = 0, i = 0; py < h; py++) {
      const cy = (py + 0.5) * sy - H / 2, ay = Math.abs(cy), qy = ay - hy;
      for (let px = 0; px < w; px++, i += 4) {
        const cx = (px + 0.5) * sx - W / 2, ax = Math.abs(cx);
        if (ax <= hx && ay <= miolo) continue;
        const qx = ax - hx, ox = Math.max(qx, 0), oy = Math.max(qy, 0), lo = Math.hypot(ox, oy);
        let nx = 0, ny = 0;
        if (lo > 0) { nx = ox / lo; ny = oy / lo; } else if (qx > qy) nx = 1; else ny = 1;
        f(data, i, R - lo - Math.min(Math.max(qx, qy), 0), cx < 0 ? -nx : nx, cy < 0 ? -ny : ny, sx);
      }
    }
    return { w, h, data };
  }

  // Mapa de refracao: vermelho = desvio horizontal, verde = vertical, 128 = parado. So o bisel desvia, sempre para
  // dentro (o backdrop-filter nao enxerga fora da caixa) e o miolo fica nitido. scale do filtro = 2 x desvio (px CSS).
  function mapaRefracao(W, H, R, o, dpr) {
    const perfil = perfilBisel(o.bisel, o.espessura, o.ior);
    let max = 1e-6;
    for (const v of perfil) max = Math.max(max, Math.abs(v));
    const m = varrer(W, H, R, dpr, o.bisel, [128, 255], (d, i, prof, nx, ny) => {
      if (prof < 0 || prof >= o.bisel) return;
      const f = prof / o.bisel * N, i0 = Math.floor(f), i1 = Math.min(N, i0 + 1);
      const u = (perfil[i0] + (perfil[i1] - perfil[i0]) * (f - i0)) / max;
      d[i] = 128 - 127 * nx * u; d[i + 1] = 128 - 127 * ny * u;
    });
    m.scale = 2 * max * o.forca;
    return m;
  }

  // Mapa de brilho (branco com alfa): aro fino na borda e luz suave no bisel, mais fortes onde a normal encara a luz.
  function mapaBrilho(W, H, R, o, dpr) {
    const a = o.luz * Math.PI / 180, lx = Math.cos(a), ly = -Math.sin(a);
    return varrer(W, H, R, dpr, o.faixa, [0, 0], (d, i, prof, nx, ny, px) => {
      if (prof <= -px / 2 || prof >= o.faixa) return;
      const cob = Math.min(1, prof / px + 0.5), al = nx * lx + ny * ly;
      const luz = Math.max(0, al) ** 2 + o.oposto * Math.max(0, -al) ** 2;
      const aro = Math.min(1, Math.max(0, 1 - (prof - o.aro) / 0.75)) * (o.base + (1 - o.base) * luz);
      const br = Math.min(1, aro + o.bisLuz * luz * (1 - prof / o.faixa) ** 3);
      const fr = o.franja * Math.max(0, 1 - Math.abs(prof - o.aro - 1.5) / 1.2) * (1 - br), A = br + fr;
      if (A <= 0) return;
      if (fr > 0) { const t = Math.atan2(ny, nx); for (let k = 0; k < 3; k++) d[i + k] = 255 * (br + fr * (0.5 + 0.5 * Math.cos(t - k * 2.094))) / A; }
      else d[i] = d[i + 1] = d[i + 2] = 255; // sem franja o aro e branco: poupa atan2/cos no laco
      d[i + 3] = 255 * A * cob;
    });
  }

  // PNG do mapa como blob: (nao data:): o style da nav fica pequeno e cada quadro do arrasto nao reprocessa ~30 KB de
  // texto. willReadFrequently deixa o canvas na CPU e evita a leitura de volta da GPU no primeiro toDataURL.
  function png(m) {
    const c = document.createElement('canvas');
    c.width = m.w;
    c.height = m.h;
    c.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(m.data, m.w, m.h), 0, 0);
    const bin = atob(c.toDataURL('image/png').slice(22)), bytes = new Uint8Array(bin.length); // 22 = 'data:image/png;base64,'
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  }

  // Filtros SVG (so Chromium), com regiao e mapa no tamanho exato do elemento. Fundo cinza 128 sob o mapa: enquanto a
  // imagem nao carrega, nada se desloca. A lente desvia vermelho, verde e azul um pouco diferente (aro arco-iris).
  function filtros(b, l) {
    let svg = document.getElementById('abas-vidro');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'abas-vidro';
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.position = 'absolute';
      document.body.appendChild(svg);
    }
    const area = (m) => `filterUnits="userSpaceOnUse" x="0" y="0" width="${m.W}" height="${m.H}"`;
    const mapa = (m) => `<feFlood flood-color="rgb(128,128,128)" result="neutro"/><feImage href="${m.url}" x="0" y="0" width="${m.W}" height="${m.H}" preserveAspectRatio="none" result="img"/><feComposite in="img" in2="neutro" operator="over" result="mapa"/>`;
    const desvio = (s, out) => `<feDisplacementMap in="SourceGraphic" in2="mapa" scale="${s.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="${out}"/>`;
    const canal = (de, k, out) => `<feColorMatrix in="${de}" type="matrix" values="${[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => (r === c && (r === k || r === 3) ? 1 : 0)).join(' ')).join(' ')}" result="${out}"/>`;
    svg.innerHTML = `<filter id="vidro-barra" ${area(b)} color-interpolation-filters="sRGB">${mapa(b)}${desvio(b.scale, 'v')}</filter>`
      + `<filter id="abas-lente" ${area(l)} color-interpolation-filters="sRGB">${mapa(l)}`
      + `${desvio(l.scale * 0.94, 'dr')}${desvio(l.scale, 'dg')}${desvio(l.scale * 1.06, 'db')}`
      + `${canal('dr', 0, 'r')}${canal('dg', 1, 'g')}${canal('db', 2, 'b')}`
      + '<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/></filter>';
  }

  // Gera os mapas no tamanho real da barra e da pilula, depois da primeira pintura e de novo so quando o tamanho muda
  // (giro, tela dividida). Brilho e refracao em tarefas separadas para nao travar um quadro so.
  function montarVidro(nav) {
    let feito = '', pedido = 0, filtroDe = ''; // filtroDe: tamanho para o qual os filtros SVG foram gerados
    // Cada URL antiga so e revogada depois que a nova ja foi aplicada.
    const urls = {}, trocar = (k, u) => { if (urls[k]) URL.revokeObjectURL(urls[k]); urls[k] = u; return u; };
    const medida = () => {
      const r = nav.getBoundingClientRect(), n = nav.querySelectorAll('.tab').length || 1;
      return { r, n, W: Math.round(r.width * 100) / 100, H: Math.round(r.height * 100) / 100 };
    };
    const gerar = () => {
      pedido = 0;
      const { r, n, W, H } = medida(), chave = `${W}x${H}x${n}`;
      if (!r.width || !r.height) return; // barra escondida (body.no-tabs)
      if (chave === feito) { nav.classList.toggle('refrata', REFRATA && filtroDe === chave); return; }
      feito = chave;
      const pad = parseFloat(getComputedStyle(nav).paddingTop) || 0, lw = (W - pad * 2) / n, lh = H - pad * 2;
      const dpr = window.devicePixelRatio || 1;
      try {
        const ub = png(mapaBrilho(W, H, H / 2, BARRA, Math.min(dpr, 3))), ul = png(mapaBrilho(lw, lh, lh / 2, LENTE, Math.min(dpr, 3)));
        nav.style.setProperty('--vidro-brilho', `url("${trocar('vb', ub)}")`);
        nav.style.setProperty('--lente-brilho', `url("${trocar('lb', ul)}")`);
        nav.classList.add('tem-brilho');
      } catch { return; } // sem canvas: fica o vidro so de CSS
      if (REFRATA) setTimeout(() => {
        if (chave !== feito) return; // o tamanho mudou de novo: a proxima rodada refaz
        try {
          const b = mapaRefracao(W, H, H / 2, BARRA, Math.min(dpr, 2)), l = mapaRefracao(lw, lh, lh / 2, LENTE, Math.min(dpr, 2));
          const ubr = png(b), ulr = png(l);
          filtros({ W, H, url: ubr, scale: b.scale }, { W: lw, H: lh, url: ulr, scale: l.scale });
          trocar('vr', ubr);
          trocar('lr', ulr);
          filtroDe = chave;
          nav.classList.add('refrata');
        } catch { nav.classList.remove('refrata'); }
      }, 0);
    };
    // Tamanho mudou (giro, tela dividida): tira ja o filtro do tamanho antigo, que deixaria parte da barra sem vidro,
    // ate o novo ficar pronto. O ResizeObserver roda antes da pintura, entao vale no mesmo quadro.
    const pedir = () => {
      const { r, n, W, H } = medida();
      if (r.width && filtroDe && filtroDe !== `${W}x${H}x${n}`) nav.classList.remove('refrata');
      if (!pedido) pedido = requestAnimationFrame(gerar);
    };
    if (window.ResizeObserver) new ResizeObserver(pedir).observe(nav); // a primeira observacao ja chama pedir
    else { addEventListener('resize', pedir); setTimeout(pedir, 0); }
  }

  // Tinta adaptativa (como o nativo): le a cor solida atras da linha dos rotulos e, quando o contraste pede, poe na
  // barra os tokens do outro tema. Foto e gradiente nao dao para ler: vale o que esta embaixo. Ao rolar (~8x/s), ao
  // redimensionar e ao trocar o tema; parado, nao custa nada.
  function tintaAdaptativa(nav) {
    const alto = window.matchMedia ? matchMedia('(prefers-contrast: more), (prefers-reduced-transparency: reduce)') : { matches: false };
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const fundo = (x, y) => {
      for (const el of document.elementsFromPoint(x, y)) {
        if (nav.contains(el) || el.tagName === 'IMG' || el.tagName === 'VIDEO') continue;
        const cs = getComputedStyle(el);
        if (cs.backgroundImage !== 'none') continue;
        const c = (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number);
        if (c.length >= 3 && (c.length < 4 || c[3] >= 0.5)) return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      }
      return null;
    };
    let espera = 0, visto = '', vezes = 0;
    const medir = () => {
      espera = 0;
      const r = nav.getBoundingClientRect();
      if (!r.width) return;
      const ls = [0.2, 0.5, 0.8].map((f) => fundo(r.left + r.width * f, r.top + r.height * 0.7)).filter((v) => v !== null);
      const l = ls.length ? ls.reduce((a, b) => a + b) / ls.length : null;
      const escuro = document.documentElement.dataset.theme === 'escuro';
      // 0,21: luminancia em que a tinta clara e a escura dao o mesmo contraste.
      const modo = alto.matches || l === null ? '' : l < 0.21 ? (escuro ? '' : 'sobre-escuro') : (escuro ? 'sobre-claro' : '');
      vezes = modo === visto ? vezes + 1 : 1;
      visto = modo;
      if (vezes === 1) return pedir(); // histerese: so troca com 2 leituras iguais seguidas
      nav.classList.toggle('sobre-escuro', modo === 'sobre-escuro');
      nav.classList.toggle('sobre-claro', modo === 'sobre-claro');
    };
    const pedir = () => { if (!espera) espera = setTimeout(() => requestAnimationFrame(medir), 120); };
    addEventListener('scroll', pedir, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(pedir).observe(document.body);
    new MutationObserver(pedir).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  window.VidroAbas = { perfilBisel, mapaRefracao, mapaBrilho, REFRATA }; // para teste

  window.arrastarAbas = function (nav, onPick) {
    let drag = null;
    let settleTimer;
    let swallowUntil = 0;
    // Mola da deformacao: s e o quanto a lente estica (negativo = achata), sv a velocidade da mola.
    let s = 0, sv = 0, vel = 0, lastX = 0, lastT = 0, raf = 0;
    montarVidro(nav);
    tintaAdaptativa(nav);
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
      swallowUntil = 0; // um toque novo nao e o clique fantasma do arrasto anterior
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
    // Fim do toque ouvido na janela: chega mesmo se o dedo soltar fora da barra ou o botao sair do DOM (paintTabs).
    addEventListener('pointerup', (e) => end(e, false), true);
    addEventListener('pointercancel', (e) => end(e, true), true);
    // Depois de arrastar, o clique que o navegador ainda manda nao abre outra aba.
    nav.addEventListener('click', (e) => { if (performance.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
    nav.addEventListener('contextmenu', (e) => e.preventDefault());
  };
})();
