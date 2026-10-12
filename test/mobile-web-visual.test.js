const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = path.join(__dirname, '..', 'public', 'm');
const read = (file) => fs.readFileSync(path.join(M, file), 'utf8');
const css = () => `${read('m.css')}\n${read('anim.css')}\n${read('barra.css')}`;

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
  return out;
}
function themes() {
  const m = read('m.css');
  const light = tokens(m.slice(m.indexOf(':root {'), m.indexOf('html[data-theme="escuro"]')));
  const dark = { ...light, ...tokens(m.slice(m.indexOf('html[data-theme="escuro"]'), m.indexOf('* {'))) };
  return { light, dark };
}

test('fundo do html e do body segue o tema e a barra inferior fica sobre um esmaecido que deixa o conteudo aparecer', () => {
  const all = css();
  assert.match(all, /html, body \{[^}]*background: var\(--bg\)/);
  assert.match(all, /body \{ padding-bottom: calc\(96px \+ var\(--sab\)\)/);
  assert.match(all, /--sab: env\(safe-area-inset-bottom, 0px\)/);
  assert.match(all, /\.tabs \{[^}]*bottom: calc\(12px \+ var\(--sab\)\)/);
  const faixa = read('barra.css').match(/body::after \{[^}]*\}/);
  assert.ok(faixa, 'falta o esmaecido atras da barra de abas');
  assert.match(faixa[0], /position: fixed/);
  assert.match(faixa[0], /bottom: 0/);
  assert.match(faixa[0], /var\(--sab\)/);
  assert.match(faixa[0], /background: var\(--bg\)/);
  assert.match(faixa[0], /(?<!-webkit-)mask-image: linear-gradient\(to top, rgba\(0, 0, 0, \.9\)/, 'a mascara deixa o conteudo aparecer pelo vidro');
  assert.match(faixa[0], /-webkit-mask-image: linear-gradient/);
  assert.match(all, /body\.no-tabs::after \{ display: none/);
});

test('barra de abas no estilo do iPhone: capsula de vidro e pilula na aba ativa', () => {
  const m = read('m.css');
  const barra = m.match(/\.tabs \{[^}]*\}/)[0];
  assert.match(barra, /height: 64px/);
  assert.match(barra, /border-radius: 32px/, 'capsula: raio igual a metade da altura');
  assert.match(barra, /repeat\(var\(--tabs-n\), minmax\(0, 1fr\)\)/);
  assert.match(m, /\.tabs-refraction \{[^}]*backdrop-filter: blur\(\d+px\) saturate/);
  assert.match(m, /\.tabs::before \{[^}]*width: calc\(\(100% - 8px\) \/ var\(--tabs-n\)\)[^}]*border-radius: 28px/);
  assert.doesNotMatch(`${m}\n${read('index.html')}`, /cc-glass-distortion|feDisplacementMap/, 'sem a distorcao SVG antiga');
});

test('barra de abas: a pilula vira lente ao tocar e da para arrastar de uma aba para outra', () => {
  const m = read('m.css');
  assert.match(m.match(/\.tabs \{[^}]*\}/)[0], /touch-action: none/, 'o arrasto nao pode virar rolagem da pagina');
  assert.match(m, /\.tabs\.is-pressed::before \{ z-index: 4; transform: translateX\(var\(--drag-x, 0px\)\) scale\(1\.15\)/, 'lente por cima dos icones, 1,15x segurando');
  assert.match(m, /\.tabs\.is-dragging::before \{ transform: translateX\(var\(--drag-x, 0px\)\) scale\(calc\(1\.35 \+ var\(--stretch, 0\) \* 1\.4\), calc\(1\.35 - var\(--stretch, 0\) \* \.5\)\)/, 'arrastando, 1,35x e esticando com a velocidade');
  assert.match(m, /\.tabs\.refrata\.is-pressed::before \{ backdrop-filter: url\(#abas-lente\)/, 'refracao so com a classe do Chromium');
  assert.match(m, /\.tabs\.is-pressed, \.tabs\.is-settling \{ overflow: visible; \}/, 'a lente cresce alem da barra');
  assert.match(m, /\.tabs\.is-pressed \.tab\.is-lens \{ color: var\(--tab-active\)/);
  const html = read('index.html');
  assert.ok(html.indexOf('abas-arrastar.js') > 0 && html.indexOf('abas-arrastar.js') < html.indexOf('app.js'), 'abas-arrastar.js carrega antes do app.js');
  assert.match(read('sw.js'), /'abas-arrastar\.js'/);
  assert.match(read('app.js'), /window\.arrastarAbas\(nav, pickTab\)/);
  const js = read('abas-arrastar.js');
  assert.match(js, /setPointerCapture/);
  assert.match(js, /pointercancel/);
  assert.match(js, /Math\.round\(x \/ cell\)/, 'solta na aba mais proxima');
  assert.match(js, /swallowUntil/, 'o clique depois do arrasto nao abre outra aba');
  assert.match(js, /id="abas-lente"[^`]*color-interpolation-filters="sRGB"/, 'mapa lido em sRGB: o meio fica parado');
  assert.match(js, /id="vidro-barra"[^`]*color-interpolation-filters="sRGB"/, 'barra em repouso tambem refrata (Chromium)');
  assert.match(js, /feDisplacementMap in="SourceGraphic" in2="mapa" scale="\$\{/, 'escala vem do mapa gerado');
  assert.match(js, /feFlood flood-color="rgb\(128,128,128\)"/, 'sem mapa carregado, nada se desloca');
  assert.match(js, /new ResizeObserver/, 'mapa refeito quando o tamanho muda');
  assert.match(js, /setProperty\('--stretch'/);
  assert.match(js, /prefers-reduced-motion: reduce/, 'sem deformacao para quem pede menos movimento');
});

test('viewport cobre o notch e o tema vale antes da primeira pintura', () => {
  const html = read('index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /<meta name="theme-color" content="#f2f8fa">/);
  assert.ok(html.indexOf('tema.js') < html.indexOf('<body>'), 'tema.js precisa carregar no head');
  const tema = read('tema.js');
  assert.match(tema, /dataset\.theme = t/);
  assert.match(tema, /#031f29/);
  assert.match(read('core.js'), /#031f29' : '#f2f8fa'/);
});

test('contraste dos pares de cor usados pelo celular, claro e escuro', () => {
  const { light, dark } = themes();
  const pares = [
    // [tema, texto, fundo, minimo]
    ['light', 'text', 'bg', 4.5], ['dark', 'text', 'bg', 4.5],
    ['light', 'n300', 'bg', 4.5], ['light', 'n300', 'surface', 4.5], ['light', 'n300', 'n800', 4.5], ['dark', 'n300', 'n800', 4.5], ['dark', 'n300', 'bg', 4.5],
    ['light', 'warn', 'bg', 4.5], ['light', 'warn', 'warn-soft', 4.5], ['light', 'warn', 'surface', 4.5], ['dark', 'warn', 'bg', 4.5], ['dark', 'warn', 'warn-soft', 4.5],
    ['light', 'accent-300', 'bg', 4.5], ['light', 'accent-300', 'accent-900', 4.5], ['dark', 'accent-300', 'accent-900', 4.5], ['dark', 'accent-300', 'surface', 4.5],
    ['light', 'danger-ink', 'bg', 4.5], ['light', 'danger-ink', 'surface', 4.5], ['dark', 'danger-ink', 'bg', 4.5], ['dark', 'danger-ink', 'surface', 4.5],
    ['light', 'tab-ink', 'bg', 4.5], ['dark', 'tab-ink', 'bg', 4.5],
    ['light', 'tab-active', 'bg', 4.5], ['dark', 'tab-active', 'bg', 4.5],
  ];
  for (const [theme, fg, bg, min] of pares) {
    const t = theme === 'light' ? light : dark;
    assert.ok(t[fg] && t[bg], `token ausente: ${fg}/${bg}`);
    assert.ok(ratio(t[fg], t[bg]) >= min, `${theme}: ${fg} sobre ${bg} = ${ratio(t[fg], t[bg]).toFixed(2)}`);
  }
  // Botao preenchido com texto branco e badge de perigo com texto branco
  for (const t of [light, dark]) {
    assert.ok(ratio('#ffffff', t.fill) >= 4.5, `fill ${ratio('#ffffff', t.fill).toFixed(2)}`);
    assert.ok(ratio('#ffffff', t.danger) >= 4.5, `danger ${ratio('#ffffff', t.danger).toFixed(2)}`);
  }
  assert.doesNotMatch(read('m.css'), /\.btn \{[^}]*background: #12a9d1/);
});

test('alvos de toque de 44 px e animacao que nao alarga a pagina', () => {
  const all = css();
  assert.match(all, /\.seg button \{ min-height: 44px/);
  assert.match(all, /\.ia-sheet \.chip-act \{ min-height: 44px/);
  assert.match(all, /\.login-show \{[^}]*height: 44px/);
  assert.match(all, /\.netbar button \{ min-height: 44px/);
  assert.match(all, /\.screen\.inner \{ animation: scrIn[^}]*backwards/);
  assert.match(all, /html \{ overflow-x: clip/);
  assert.match(all, /::placeholder \{ color: var\(--n300\)/);
  assert.match(all, /--side: max\(20px, env\(safe-area-inset-left/);
});

test('vidro sem fundo leitoso: tinta baixa, url() so no Chromium e esmaecido leve dentro da barra', () => {
  const m = read('m.css');
  for (const linha of m.match(/--vidro-tinta: [^;]+;/g)) for (const a of linha.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)) assert.ok(Number(a[1]) <= 0.3, `tinta do vidro alta: ${linha}`);
  assert.doesNotMatch(m, /-webkit-backdrop-filter:[^;]*url\(/, 'no Safari um url() apaga o backdrop-filter inteiro');
  assert.match(m, /\.tabs\.refrata \.tabs-refraction \{ backdrop-filter: blur\(\dpx\) url\(#vidro-barra\)/);
  assert.match(m, /\.tabs-refraction \{[^}]*-webkit-backdrop-filter: blur\([2-8]px\)/, 'desfoque baixo');
  assert.match(read('barra.css'), /rgba\(0, 0, 0, \.3\) calc\(var\(--tabs-gap\) \+ var\(--sab\)\), transparent 100%/, 'esmaecido leve na base da barra e nada acima dos primeiros 24px');
  assert.match(read('barra.css'), /height: calc\(var\(--tabs-gap\) \+ var\(--sab\) \+ 24px\)/);
});

test('mapa do vidro: miolo parado, borda puxa para dentro, fora da capsula neutro', () => {
  const ctx = { navigator: { userAgent: 'Chrome/124' }, matchMedia: () => ({ matches: false }) };
  ctx.window = ctx;
  require('node:vm').runInNewContext(read('abas-arrastar.js'), ctx);
  const m = ctx.VidroAbas.mapaRefracao(347, 64, 32, { bisel: 16, espessura: 16, ior: 1.5, forca: 1 }, 1);
  const px = (x, y) => Array.from(m.data.slice((y * m.w + x) * 4, (y * m.w + x) * 4 + 4));
  assert.deepEqual(px(173, 32), [128, 128, 128, 255]);
  assert.ok(px(0, 32)[0] > 220 && px(346, 32)[0] < 36, 'laterais puxam para dentro');
  assert.ok(px(173, 0)[1] > 220 && px(173, 63)[1] < 36, 'topo e base puxam para dentro');
  assert.deepEqual(px(0, 0), [128, 128, 128, 255], 'canto fora da capsula nao desloca');
  assert.ok(m.scale > 40 && m.scale < 48, `scale ${m.scale}`);
});

const carregar = (ua) => {
  const ctx = { navigator: { userAgent: ua }, matchMedia: () => ({ matches: false }) };
  ctx.window = ctx;
  require('node:vm').runInNewContext(read('abas-arrastar.js'), ctx);
  return ctx.VidroAbas;
};

test('url() no backdrop-filter so com .refrata, e .refrata so no Chromium', () => {
  const m = read('m.css').replace(/\/\*[\s\S]*?\*\//g, ''); // sem comentarios: um comentario citando .refrata nao pode aprovar a regra
  let n = 0;
  for (const [, sel] of m.matchAll(/([^{}]+)\{[^}]*backdrop-filter:[^;}]*url\(/g)) { n++; assert.match(sel, /\.refrata/, `url() fora do Chromium: ${sel.trim()}`); }
  assert.ok(n >= 2, `regras com url(): ${n}`);
  assert.doesNotMatch(m, /backdrop-filter:[^;]*var\(/, 'WebKit: var() no backdrop-filter');
  assert.equal(carregar('Mozilla/5.0 (Linux; Android 15; SM-A175F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 SuiteConstrutec/1.0').REFRATA, true);
  assert.equal(carregar('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1').REFRATA, false);
  assert.equal(carregar('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1').REFRATA, false);
  assert.equal(carregar('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15').REFRATA, false);
});

test('brilho e lente: aro aceso, miolo vazio, lado da luz mais forte; lente 67.8 x 56 em dpr 2.625', () => {
  const v = carregar('Chrome/124');
  const b = v.mapaBrilho(347, 64, 32, { luz: 120, oposto: 0.45, aro: 1, base: 0.3, faixa: 10, bisLuz: 0.1, franja: 0 }, 1);
  const a = (x, y) => b.data[(y * b.w + x) * 4 + 3];
  assert.equal(a(173, 32), 0, 'miolo transparente');
  assert.ok(a(100, 0) > 150 && a(250, 63) > 0 && a(100, 0) > a(250, 63), `topo-esq ${a(100, 0)} base-dir ${a(250, 63)}`);
  const l = v.mapaRefracao(67.8, 56, 28, { bisel: 14, espessura: 10, ior: 1.5, forca: 1 }, 2.625);
  assert.equal(l.w, 178);
  assert.equal(l.h, 147);
  const p = (x, y) => Array.from(l.data.slice((y * l.w + x) * 4, (y * l.w + x) * 4 + 2));
  assert.deepEqual(p(89, 73), [128, 128]);
  assert.ok(p(0, 73)[0] > 220 && p(177, 73)[0] < 36);
});

test('legibilidade: barra troca de tinta conforme o fundo e a lente nao lava o icone', () => {
  const m = read('m.css'), js = read('abas-arrastar.js');
  assert.match(js, /elementsFromPoint/, 'barra le o que passa atras');
  assert.match(m, /\.tabs\.sobre-escuro \{ --tab-ink: #eef4f6; --tab-active: #5fd0ee;/);
  assert.match(m, /\.tabs\.sobre-claro \{ --tab-ink: #1c2a31; --tab-active: #08647f;/);
  assert.match(m, /radial-gradient\(closest-side, transparent 65%, var\(--lente-luz\)\)/, 'luz da lente so na borda');
  assert.match(js, /addEventListener\('pointerup', \(e\) => end\(e, false\), true\)/, 'fim do toque ouvido na janela');
  assert.match(js, /swallowUntil = 0;/, 'toque novo nao e engolido');
  assert.match(js, /URL\.createObjectURL/, 'mapas como blob:, nao data:, no style da barra');
});

