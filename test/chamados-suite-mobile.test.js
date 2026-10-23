const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const ORIGIN = 'https://chamados.exemplo.test';
const CODE = 'B'.repeat(43);
const future = () => Math.floor(Date.now() / 1000) + 60;

// Celular: menu Suíte (public/m/suite.js) com DOM simulado, sem jsdom.
function mobile({ inApp = false, access, handoff }) {
  const calls = { api: [], assigned: [], toasts: [], opened: [] };
  const slot = { html: '', insertAdjacentHTML(_where, html) { this.html += html; } };
  const el = { id: '', className: '', innerHTML: '', listeners: {}, removed: false,
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector: (selector) => (selector === '[data-chamados-slot]' ? slot : null),
    remove() { this.removed = true; } };
  const document = {
    createElement: () => { el.removed = false; return el; },
    getElementById: (id) => (id === 'suite-sheet' && !el.removed ? el : null),
    body: { appendChild() {} }, addEventListener() {}, removeEventListener() {},
  };
  const CC = {
    esc: (value) => String(value), icon: (name) => `[${name}]`, $: () => ({ focus() {} }),
    session: { token: () => 'tok' },
    toast: (message) => calls.toasts.push(message),
    api: async (url, options) => {
      calls.api.push([url, options?.method || 'GET', options?.body]);
      if (url === '/auth/suite-chamados') { if (access instanceof Error) throw access; return { data: access }; }
      if (url === '/auth/suite-handoff') { if (handoff instanceof Error) throw handoff; return { data: handoff }; }
      throw new Error('rota inesperada ' + url);
    },
  };
  const context = {
    window: { CC, open: (...args) => calls.opened.push(args) }, document, CC: undefined,
    navigator: { userAgent: inApp ? 'x SuiteConstrutec/3.1.0' : 'Chrome' },
    location: { search: '', assign: (url) => calls.assigned.push(url) },
    URL, URLSearchParams, Number, String, setTimeout: (fn) => fn(),
  };
  vm.runInNewContext(read('public/m/suite.js'), context);
  const click = (matches) => el.listeners.click({
    target: { closest: (selector) => (matches.includes(selector) ? { selector } : null) },
    preventDefault() { calls.prevented = true; },
  });
  return { CC: context.window.CC, calls, slot, el, click };
}

const allowed = () => ({ allowed: true, application: 'chamados', origin: ORIGIN, expiresAt: future() });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('celular: sem concessão confirmada pela central o Chamados não aparece', async () => {
  for (const access of [{ allowed: false }, { ...allowed(), origin: 'http://inseguro.test/' }, { ...allowed(), application: 'outro' },
    { ...allowed(), expiresAt: 1 }, new Error('503')]) {
    const t = mobile({ access });
    t.CC.suite.open();
    await settle();
    assert.equal(t.slot.html, '', JSON.stringify(access));
  }
  const html = mobile({ access: allowed() });
  html.CC.suite.open();
  assert.doesNotMatch(html.el.innerHTML, /chamadopro/i, 'o ChamadoPro antigo saiu do menu');
  assert.match(html.el.innerHTML, /data-chamados-slot/);
});

test('celular no app Android: o Chamados troca de WebView por suite://app/chamados', async () => {
  const t = mobile({ inApp: true, access: allowed() });
  t.CC.suite.open();
  await settle();
  assert.match(t.slot.html, /data-chamados href="suite:\/\/app\/chamados"/);
  assert.match(t.slot.html, /Chamados e O\.S\./);
  assert.doesNotMatch(t.slot.html, /target="_blank"/);
  t.click(['[data-chamados]', 'a']);
  assert.equal(t.calls.prevented, undefined, 'o app trata o link; a página não cancela');
  assert.deepEqual(t.calls.api.map((call) => call[0]), ['/auth/suite-chamados'], 'o app pede o código pela conta nativa, não pelo site');
});

test('celular no navegador: entra pela mesma aba com o código de uso único, sem popup', async () => {
  const t = mobile({ access: allowed(), handoff: { target: 'chamados', origin: ORIGIN, code: CODE, expiresAt: future() } });
  t.CC.suite.open();
  await settle();
  assert.match(t.slot.html, new RegExp(`data-chamados href="${ORIGIN}"`));
  t.click(['[data-chamados]', 'a']);
  await settle();
  assert.equal(t.calls.prevented, true);
  assert.deepEqual(t.calls.assigned, [`${ORIGIN}/#handoff=${CODE}`]);
  assert.equal(t.calls.opened.length, 0, 'sem window.open');
  const [, method, body] = t.calls.api.find((call) => call[0] === '/auth/suite-handoff');
  assert.equal(method, 'POST');
  assert.equal(JSON.stringify(body), '{"target":"chamados"}');
});

test('celular no navegador: código inválido ou falha não navega e avisa', async () => {
  for (const handoff of [{ target: 'chamados', origin: ORIGIN, code: 'curto', expiresAt: future() },
    { target: 'chamados', origin: 'https://outro.test', code: CODE, expiresAt: future() },
    { target: 'orcamentos', origin: ORIGIN, code: CODE, expiresAt: future() },
    Object.assign(new Error('Sem internet.'), { status: 0 })]) {
    const t = mobile({ access: allowed(), handoff });
    t.CC.suite.open();
    await settle();
    t.click(['[data-chamados]', 'a']);
    await settle();
    assert.deepEqual(t.calls.assigned, []);
    assert.equal(t.calls.toasts.length, 1);
  }
});

test('celular: o cache do service worker foi renovado e os menus não têm o ChamadoPro antigo nem emoji', () => {
  assert.match(read('public/m/sw.js'), /const CACHE = 'cc-celular-v34'/);
  for (const file of ['public/m/suite.js', 'public/d/suite.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /chamadopro-app\.lucas-coelho5923/, file);
    assert.doesNotMatch(source, /\p{Extended_Pictographic}/u, file);
    assert.match(source, /data-chamados-slot/, `${file} marca o item para o script injetado não duplicar`);
  }
  assert.ok(read('public/m/suite.js').split('\n').length <= 350);
});

test('Cloudflare: o script injetado não duplica o item quando o menu já é o novo', () => {
  const ui = read('cloudflare/center-container/chamados/worker/navigation-ui.js');
  assert.match(ui, /parent\.querySelector\('\[data-chamados-slot\]'\)/);
  const assets = read('cloudflare/center-container/chamados/worker/navigation-assets.js');
  assert.match(assets, /data-chamados-slot/, 'assets gerados em dia (node scripts/build-chamados-central-assets.cjs)');
});

test('Android: o Chamados é um app da Suíte com WebView própria, código de entrada e sem ponte para o site', () => {
  const dir = 'android/app/src/main/java/br/com/rcconstrutec/centrocustos/';
  const views = read(dir + 'SuiteViews.java');
  assert.match(views, /CHAMADOS = "chamados"/);
  assert.match(views, /BuildConfig\.CHAMADOS_WEB_BASE/);
  assert.match(views, /needsHandoff\(String app\) \{ return CHAMADOS\.equals\(app\); \}/);
  assert.match(views, /\|\| CHAMADOS\.equals\(app\)/, 'suite://app/chamados é um destino conhecido');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /chamadosWebBase/);
  assert.match(gradle, /https:\/\/construtec-chamados\.construtec-reports\.workers\.dev/);
  assert.match(gradle, /buildConfigField 'String', 'CHAMADOS_WEB_BASE'/);
  const main = read(dir + 'MainActivity.java');
  assert.match(main, /auth\.handoffCode\(app\)/, 'mesmo código de uso único dos outros apps');
  assert.match(main, /SuiteViews\.needsHandoff\(app\) && !url\.contains\("#handoff="\)/, 'sem código o Chamados não abre');
  assert.match(main, /SuiteViews\.needsHandoff\(app\) && !action\.startsWith\("app\/"\)/, 'o site do Chamados só pode trocar de app');
  assert.ok(main.split('\n').length <= 350, 'MainActivity passou de 350 linhas');
  const web = read(dir + 'AppWebView.java');
  assert.match(web, /allowed\.getHost\(\)\.equalsIgnoreCase\(target\.getHost\(\)\)/, 'links de outra origem saem para o navegador do aparelho');
  assert.match(web, /startActivity\(new Intent\(Intent\.ACTION_VIEW, target\)\)/);
  assert.doesNotMatch(main.slice(main.indexOf('private void showWebApp')), /addJavascriptInterface/, 'nenhum site remoto recebe a ponte AndroidAuth');
});
