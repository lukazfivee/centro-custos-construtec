const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'cloudflare/center-container/chamados/worker');
const load = () => import(pathToFileURL(path.join(dir, 'suite-launcher.js')).href);
const req = (pathname, options) => new Request('https://central.test' + pathname, options);
function scriptContext({ pathname = '/', hash = '', mobile = false, width = 1440, coarse = false } = {}) {
  const links = {}, redirects = [], listeners = [];
  const context = {
    document: { getElementById: () => ({ setAttribute: (name, value) => { links[name] = value; } }) },
    navigator: { userAgent: mobile ? 'Mozilla/5.0 (iPhone) Mobile' : 'Desktop' },
    matchMedia: q => ({ matches: q.includes('max-width') ? width <= 767 : coarse,
      addEventListener: (name, callback) => listeners.push({ name, callback }) }),
    location: { pathname, hash, search: '', replace: value => redirects.push(value) },
    URLSearchParams,
  };
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('Public launcher must not read stored identity'); } });
  Object.defineProperty(context, 'sessionStorage', { get() { throw new Error('Public launcher must not read stored identity'); } });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/suite/suite.js'), 'utf8'), context);
  return { links, redirects, listeners };
}

test('launcher serves root and both suite URLs with three choices and no automatic redirect', async () => {
  const { handleSuiteLauncher } = await load();
  for (const url of ['/', '/suite', '/suite/']) {
    const response = handleSuiteLauncher(req(url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    assert.match(html, /Qual aplicativo voc\u00ea quer abrir/);
    for (const id of ['app-centro', 'app-orcamentos', 'app-chamados']) assert.ok(html.includes('id="' + id + '"'));
    assert.match(html, /href="\/d\/"/);
    assert.equal((html.match(/class="app"/g) || []).length, 3);
  }
});
test('HEAD stays bodyless and retains public security and no-store headers', async () => {
  const { handleSuiteLauncher } = await load();
  for (const url of ['/', '/suite/', '/suite/suite.css', '/suite/suite.js']) {
    const response = handleSuiteLauncher(req(url, { method: 'HEAD' }));
    assert.equal(response.status, 200); assert.equal(await response.text(), '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
test('legacy queries, root writes and unrelated routes still use original handlers', async () => {
  const { handleSuiteLauncher } = await load();
  for (const url of ['/?entrar=1', '/?antiga=1', '/?code=callback', '/d/', '/m/', '/v1/auth/login', '/index.html', '/suite/unknown']) {
    assert.equal(handleSuiteLauncher(req(url)), undefined, url);
  }
  const request = req('/', { method: 'POST', body: 'unchanged body' });
  assert.equal(handleSuiteLauncher(request), undefined);
  assert.equal(await request.text(), 'unchanged body');
});
test('only reads are accepted for owned suite pages and assets', async () => {
  const { handleSuiteLauncher } = await load();
  for (const url of ['/suite', '/suite/', '/suite/suite.js', '/suite/suite.css']) {
    const response = handleSuiteLauncher(req(url, { method: 'POST' }));
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
});
test('mobile server fallback works without JavaScript', async () => {
  const { handleSuiteLauncher } = await load();
  for (const agent of ['iPhone', 'Android', 'iPad', 'SuiteConstrutec/1.0']) {
    const html = await handleSuiteLauncher(req('/suite/', { headers: { 'user-agent': agent } })).text();
    assert.match(html, /id="app-centro" href="\/m\/"/);
  }
});
test('generated resources exactly match reviewable sources', async () => {
  const assets = await import(pathToFileURL(path.join(dir, 'suite-launcher-assets.js')).href);
  for (const [name, file] of [['suiteDocument', 'index.html'], ['suiteStyles', 'suite.css'], ['suiteScript', 'suite.js']]) {
    assert.equal(assets[name], fs.readFileSync(path.join(root, 'public/suite', file), 'utf8'));
  }
  const { handleSuiteLauncher } = await load();
  assert.match(handleSuiteLauncher(req('/suite/suite.css')).headers.get('content-type'), /^text\/css/);
  assert.match(handleSuiteLauncher(req('/suite/suite.js')).headers.get('content-type'), /^application\/javascript/);
});
test('plain desktop root stays at the app choice without reading identity storage', () => {
  const c = scriptContext();
  assert.deepEqual(c.redirects, []); assert.equal(c.links.href, '/d/');
  assert.equal(c.listeners.length, 1);
});
test('mobile and coarse narrow viewports choose the mobile Centre only after app click', () => {
  for (const options of [{ mobile: true }, { width: 390, coarse: true }]) {
    const c = scriptContext(options);
    assert.deepEqual(c.redirects, []); assert.equal(c.links.href, '/m/');
  }
  assert.equal(scriptContext({ width: 390, coarse: false }).links.href, '/d/');
});
test('Orcamentos keeps its own responsive entry and existing full-version preference', () => {
  const html = fs.readFileSync(path.join(root, 'public/suite/index.html'), 'utf8');
  assert.match(html, /id="app-orcamentos" href="https:\/\/construtec-orcamentos-cloud\.construtec-reports\.workers\.dev\/"/);
  assert.match(html, /id="app-chamados" href="https:\/\/construtec-chamados\.construtec-reports\.workers\.dev\/"/);
  assert.doesNotMatch(html, /localhost|lucas-coelho5923|target="_blank"/);
});
test('explicit root handoffs and financial links retain their destination and fragment', () => {
  for (const hash of ['#handoff=' + 'A'.repeat(43), '#obra=12', '#pedidos=1', '#/obras/12/medicoes']) {
    assert.deepEqual(scriptContext({ hash }).redirects, ['/d/' + hash]);
    assert.deepEqual(scriptContext({ hash, mobile: true }).redirects, ['/m/' + hash]);
  }
});
test('selector URL and unrelated fragments never trigger an app automatically', () => {
  for (const options of [{ hash: '#aplicativos' }, { hash: '#handoff=bad' }, { hash: '#url=https://evil.invalid' },
    { pathname: '/suite/', hash: '#handoff=' + 'A'.repeat(43) }]) {
    assert.deepEqual(scriptContext(options).redirects, []);
  }
});
test('brand and fonts reuse existing public assets and source files stay modular', () => {
  for (const rel of ['public/d/simbolo.png', 'public/m/fonts/plex-400.woff2', 'public/m/fonts/plex-600.woff2']) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
  }
  for (const file of ['index.html', 'suite.css', 'suite.js']) {
    assert.ok(fs.readFileSync(path.join(root, 'public/suite', file), 'utf8').split(/\r?\n/).length <= 350);
  }
});
