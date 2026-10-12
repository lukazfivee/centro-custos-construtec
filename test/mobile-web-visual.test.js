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
  assert.match(m, /\.tabs\.is-pressed::before \{ z-index: 4;[^}]*translateX\(var\(--drag-x, 0px\)\) scale\(calc\(1\.25 \+ var\(--stretch, 0\) \* 1\.25\), calc\(1\.25 - var\(--stretch, 0\) \* \.7\)\)/, 'lente por cima dos icones e esticando com a velocidade');
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
  assert.match(js, /feDisplacementMap in="SourceGraphic" in2="mapa" scale="16"/);
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
