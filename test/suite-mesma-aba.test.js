const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const worker = (file) => import(pathToFileURL(path.join(ROOT, 'cloudflare/center-container/chamados/worker', file)).href);
const WEBMAIL = 'https://webmailpro.uol.com.br/';
const ORCAMENTOS = 'https://orcamentos.rcconstrutec.online/';
const ORIGIN = 'https://chamados.exemplo.test';
const CODE = 'A'.repeat(43);
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Inspect rendered links, including decoded generated Worker exports.
// No line is discarded just because it mentions the webmail exception.
function links(html) {
  return [...html.matchAll(/<a\b[^>]*>/gi)].map(([tag]) => {
    return Object.fromEntries([...tag.matchAll(/\b(href|target|rel)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
      .map(([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare]));
  });
}
function sameTab(link) {
  assert.ok(!link.target || link.target.toLowerCase() === '_self', link.href + ': target=' + link.target);
}

function desktop() {
  const calls = { assigned: [], opened: [], api: [] };
  const element = () => ({ listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute() {}, focus() {} });
  const root = element(), button = element(), pop = element();
  root.isConnected = true;
  const slot = { replaceChildren() {}, append() {} };
  const CC = {
    esc: String, d: { ic: () => '', ui: { chip: () => '' }, el: (html) => html },
    $: (selector) => ({ '.suite': root, button, '.pop': pop, '[data-chamados-slot]': slot }[selector] || button),
    session: { token: () => 'sessao-teste' }, toast: (message) => assert.fail(message),
    api: async (url, options) => {
      calls.api.push([url, options]);
      const expiresAt = Math.floor(Date.now() / 1000) + 60;
      return { data: url === '/auth/suite-chamados'
        ? { allowed: true, application: 'chamados', origin: ORIGIN, expiresAt }
        : { target: 'chamados', origin: ORIGIN, code: CODE, expiresAt } };
    },
  };
  vm.runInNewContext(read('public/d/suite.js'), {
    window: { CC, open: (...args) => calls.opened.push(args) }, document: { addEventListener() {} },
    URL, location: { assign: (url) => calls.assigned.push(url) },
  });
  CC.d.montarSuite();
  return { root, calls, clickChamados: () => pop.listeners.click({
    target: { closest: (selector) => selector === '[data-chamados]' ? {} : null }, preventDefault() {},
  }) };
}

test('Suite desktop: Orçamentos fica na mesma aba e só o destino exato do webmail abre em outra', () => {
  const rendered = links(desktop().root.innerHTML);
  assert.ok(rendered.some((link) => link.href === ORCAMENTOS));
  const mail = rendered.filter((link) => link.href === WEBMAIL);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].target, '_blank');
  assert.match(mail[0].rel, /\bnoopener\b/);
  rendered.filter((link) => link.href !== WEBMAIL).forEach(sameTab);
});

test('Suite desktop: clique no Chamados pede código de uso único e navega sem popup', async () => {
  const menu = desktop();
  await settle();
  menu.clickChamados();
  await settle();
  assert.deepEqual(menu.calls.assigned, [ORIGIN + '/#handoff=' + CODE]);
  assert.deepEqual(menu.calls.opened, []);
  const [, options] = menu.calls.api.find(([url]) => url === '/auth/suite-handoff');
  assert.equal(options.method, 'POST');
  assert.equal(options.body.target, 'chamados');
});

test('Suite mobile: links de Orçamentos, proposta e Chamados ficam na mesma aba', async () => {
  let sheet = null;
  const slot = { html: '', insertAdjacentHTML(_where, html) { this.html += html; } };
  const CC = { esc: String, icon: () => '', session: { token: () => 'sessao-teste' },
    $: () => ({ focus() {} }), api: async () => ({ data: { allowed: true, application: 'chamados', origin: ORIGIN,
      expiresAt: Math.floor(Date.now() / 1000) + 60 } }) };
  const document = { addEventListener() {}, removeEventListener() {}, getElementById: () => sheet,
    createElement: () => ({ addEventListener() {}, querySelector: () => slot, remove() { sheet = null; } }),
    body: { appendChild(element) { sheet = element; } } };
  vm.runInNewContext(read('public/m/suite.js'), { window: { CC }, document, URL, URLSearchParams,
    navigator: { userAgent: 'Chrome' }, location: { search: '' } });
  CC.suite.context = { proposta: { id: 'proposta-1', numero: '001' } };
  CC.suite.open();
  await settle();
  const rendered = links(sheet.innerHTML + slot.html);
  for (const href of [ORCAMENTOS, ORCAMENTOS + '#proposta=proposta-1', ORIGIN]) {
    assert.ok(rendered.some((link) => link.href === href), href);
  }
  rendered.forEach(sameTab);
});

test('Suite: seletor e menu legado preservam os destinos na mesma aba, inclusive no HTML gerado', async () => {
  const { suiteDocument } = await worker('suite-launcher-assets.js');
  for (const html of [read('public/index.html'), read('public/suite/index.html'), suiteDocument]) {
    assert.equal(typeof html, 'string');
    const rendered = links(html);
    assert.ok(rendered.some((link) => link.href === ORCAMENTOS));
    assert.ok(rendered.some((link) => ['/d/', '__CENTRO_ENTRY__'].includes(link.href)));
    assert.ok(rendered.some((link) => ['/chamados/entrar', 'https://chamados.rcconstrutec.online/'].includes(link.href)));
    rendered.forEach(sameTab);
  }
});

test('Suite: links injetados de entrada e administração usam a mesma aba no fonte e no script gerado', async () => {
  const { navigationScript } = await worker('navigation-assets.js');
  for (const source of [read('cloudflare/center-container/chamados/worker/navigation-ui.js'), navigationScript]) {
    for (const mobile of [false, true]) for (const admin of [false, true]) {
      const rendered = [];
      const parent = { querySelectorAll: () => [], querySelector: () => null,
        insertBefore: (link) => rendered.push(link), appendChild: (link) => rendered.push(link) };
      const document = { readyState: 'complete', body: {},
        createElement: () => ({ dataset: {}, setAttribute() {} }),
        querySelector: (selector) => selector === (mobile ? '#suite-sheet .sheet' : '.suite .pop[role="menu"]') ? parent : null };
      vm.runInNewContext(source, { document, URL,
        window: { CC: { session: { user: () => ({ role: admin ? 'admin' : 'gestor' }) } } },
        MutationObserver: class { observe() {} } });
      assert.deepEqual(rendered.map((link) => link.href), admin ? ['/chamados/entrar', '/chamados/acessos'] : ['/chamados/entrar']);
      rendered.forEach(sameTab);
    }
  }
});
