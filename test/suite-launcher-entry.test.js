const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const workerDir = path.join(__dirname, '../cloudflare/center-container');
const config = fs.readFileSync(path.join(workerDir, 'wrangler.jsonc'), 'utf8');
const main = config.match(/^\s*"main"\s*:\s*"([^"]+)"/m)?.[1];
assert.ok(main, 'Conventional Wrangler config declares its entrypoint.');
const entry = path.resolve(workerDir, main);
let workerPromise;
function conventionalWorker() {
  if (!workerPromise) {
    let source = fs.readFileSync(entry, 'utf8');
    const replace = (old, next) => {
      assert.equal(source.split(old).length, 2, 'Expected Cloudflare runtime import: ' + old);
      source = source.replace(old, next);
    };
    // Only Cloudflare runtime classes are simulated. The configured fetch and local handlers are real.
    replace("import { Container } from '@cloudflare/containers';", 'class Container {}');
    replace("import { env, WorkerEntrypoint } from 'cloudflare:workers';",
      'const env = Object.freeze({}); class WorkerEntrypoint {}');
    source = source.replace(/from (['"])(\.[^'"]+)\1/g,
      (_, quote, relative) => 'from ' + JSON.stringify(pathToFileURL(path.resolve(path.dirname(entry), relative)).href));
    source += '\n//# sourceURL=conventional-worker-fixture.mjs\n';
    workerPromise = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')).then(m => m.default);
  }
  return workerPromise;
}
test('configured conventional entry serves the chooser before reading environment or private integrations', async () => {
  const worker = await conventionalWorker();
  const untouched = new Proxy({}, { get(_target, key) { throw Error('Public chooser read env.' + String(key)); } });
  for (const pathname of ['/', '/suite', '/suite/']) {
    const response = await worker.fetch(new Request('https://central.test' + pathname), untouched);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    for (const id of ['app-centro', 'app-orcamentos', 'app-chamados']) assert.ok(html.includes('id="' + id + '"'));
  }
  for (const pathname of ['/suite/suite.js', '/suite/suite.css']) {
    const response = await worker.fetch(new Request('https://central.test' + pathname), untouched);
    assert.equal(response.status, 200);
  }
  const head = await worker.fetch(new Request('https://central.test/', { method: 'HEAD' }), untouched);
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
test('configured conventional entry still delegates financial routes, legacy callbacks and root writes', async () => {
  const worker = await conventionalWorker(), delegated = [];
  const environment = {
    CHAMADOS_ENABLED: 'false', DATABASE_URL: 'fixture', JWT_SECRET: 'fixture',
    API: { getByName(name) {
      assert.equal(name, 'production');
      return { async fetch(request) {
        delegated.push({ url: request.url, method: request.method, body: await request.text() });
        return new Response('financial-fixture');
      } };
    } },
  };
  for (const pathname of ['/d/', '/m/', '/?entrar=1', '/?antiga=1', '/?code=legacy-callback']) {
    const url = 'https://central.test' + pathname;
    const response = await worker.fetch(new Request(url), environment);
    assert.equal(await response.text(), 'financial-fixture');
    assert.deepEqual(delegated.at(-1), { url, method: 'GET', body: '' });
  }
  const request = new Request('https://central.test/', { method: 'POST', body: 'preserve-existing-body' });
  const response = await worker.fetch(request, environment);
  assert.equal(await response.text(), 'financial-fixture');
  assert.deepEqual(delegated.at(-1), {
    url: 'https://central.test/', method: 'POST', body: 'preserve-existing-body',
  });
  assert.equal(delegated.length, 6);
});
