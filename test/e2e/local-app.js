// Test-only boundary: the financial UI is actual source; the unrelated embedded
// Orçamentos application is a same-origin fixture, never a production request.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const FIXTURE_PATH = '/__e2e__/orcamentos-dependency.html';
const SOURCE_PATH = path.join(__dirname, '../../public/index.html');
const FIXTURE_HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dependência isolada do E2E</title></head>'
  + '<body data-e2e-fixture="orcamentos-dependency">Fixture local de dependência externa. Este teste valida a interface financeira da Central.</body></html>';

function createLocalUiApp(realApp) {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const pattern = /(<iframe\b[^>]*\bid="orcamentos-frame"[^>]*\bsrc=")([^"]+)(")/g;
  const matches = [...source.matchAll(pattern)];
  assert.equal(matches.length, 1, 'O harness deve substituir exatamente um iframe externo conhecido.');
  assert.equal(matches[0][2], 'https://construtec-orcamentos-cloud.construtec-reports.workers.dev/');
  const shell = source.replace(pattern, '$1' + FIXTURE_PATH + '$3');
  const app = express();
  app.get(['/', '/index.html'], (request, response, next) => {
    if (request.path !== '/index.html' && request.query.antiga === undefined && request.query.entrar === undefined) return next();
    response.set('Cache-Control', 'no-store').type('html').send(shell);
  });
  app.get(FIXTURE_PATH, (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    response.type('html').send(FIXTURE_HTML);
  });
  app.use(realApp);
  return { app, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    fixturePath: FIXTURE_PATH, shellSubstitutions: matches.length };
}
function loopbackFetchGuard() {
  const original = globalThis.fetch, blocked = [];
  const guarded = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      blocked.push(url.origin);
      return Promise.reject(new Error('E2E bloqueou fetch externo: ' + url.origin));
    }
    return original(input, init);
  };
  globalThis.fetch = guarded;
  return { blocked, restore() { if (globalThis.fetch === guarded) globalThis.fetch = original; } };
}
async function assertLocalUiTraffic(driver, ctx, testContext) {
  const frameUrl = await driver.executeScript("return document.querySelector('#orcamentos-frame').src");
  assert.equal(frameUrl, ctx.baseUrl + FIXTURE_PATH, 'O iframe externo deve usar somente a fixture local.');
  await driver.wait(async () => driver.executeScript(
    "return document.querySelector('#orcamentos-frame').contentDocument?.body?.dataset.e2eFixture === 'orcamentos-dependency'"),
  10000, 'A fixture de dependência deve carregar no mesmo navegador.');
  const messages = [];
  // The initial KPI markup already contains R$; wait for real data, preserving
  // each batch because Chrome drains performance logs when they are read.
  await driver.wait(async () => {
    const entries = await driver.manage().logs().get('performance');
    messages.push(...entries.map(entry => JSON.parse(entry.message).message));
    return messages.some(item => item.method === 'Network.responseReceived'
      && item.params.response.status === 200
      && new URL(item.params.response.url).pathname.startsWith('/api/dashboard'));
  }, 10000, 'O dashboard deve concluir uma resposta 200 da API real local.');
  const requests = messages.filter(item => item.method === 'Network.requestWillBeSent')
    .map(item => new URL(item.params.request.url))
    .filter(url => ['http:', 'https:'].includes(url.protocol));
  assert.ok(requests.length > 0, 'Logs de rede do navegador devem estar disponíveis.');
  const origins = [...new Set(requests.map(url => url.origin))].sort();
  assert.deepEqual(origins, [ctx.baseUrl], 'Todos os requests da UI devem permanecer no servidor local.');
  const requested = new Set(requests.map(url => url.pathname));
  for (const target of ['/app.js', '/navigation.js', '/api/auth/login', FIXTURE_PATH]) {
    assert.ok(requested.has(target), 'A interface real deve carregar/executar: ' + target);
  }
  assert.ok([...requested].some(target => target.startsWith('/api/dashboard')), 'O dashboard deve consultar sua API real local.');
  assert.deepEqual(ctx.fetchGuard.blocked, [], 'Nenhum componente do servidor deve tentar fetch externo.');
  testContext.diagnostic(JSON.stringify({ evidence: 'local-financial-ui', browserRequests: requests.length,
    origins, sourceSha256: ctx.sourceSha256, shellSubstitutions: ctx.shellSubstitutions,
    actualUi: ['login', 'app.js', 'navigation.js', 'dashboard API'], dependencyFixture: FIXTURE_PATH,
    externalFetchAttempts: ctx.fetchGuard.blocked.length, productionCspChanged: false }));
}
module.exports = { createLocalUiApp, loopbackFetchGuard, assertLocalUiTraffic };
