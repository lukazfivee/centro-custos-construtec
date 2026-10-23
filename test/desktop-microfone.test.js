// Microfone do ditado no app Windows (desktop/permissoes-microfone.cjs): só áudio e só a página do próprio app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { paginaPropria, politicaMicrofone, instalarMicrofone } = require('../desktop/permissoes-microfone.cjs');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const CENTRO = 'http://127.0.0.1:3333';
const PASTA_ORC = path.join(ROOT, 'modules', 'orcamentos');
const ORC_URL = pathToFileURL(path.join(PASTA_ORC, 'index.html')).href + '#sessao=x';
const CHAMADOS = 'https://chamados.exemplo.test';

function instalar(opcoes) {
  const h = {};
  instalarMicrofone({ setPermissionRequestHandler: (fn) => { h.pedido = fn; }, setPermissionCheckHandler: (fn) => { h.checagem = fn; } }, opcoes);
  const pedir = (permissao, detalhes) => { let r = null; h.pedido({}, permissao, (v) => { r = v; }, detalhes); return r; };
  return { pedir, checar: (permissao, origem, detalhes) => h.checagem({}, permissao, origem, detalhes) };
}

test('página própria: origem exata do Centro e do Chamados, arquivos só da pasta do Orçamentos', () => {
  const cfg = { origens: [CENTRO, CHAMADOS], pastas: [PASTA_ORC] };
  assert.ok(paginaPropria(`${CENTRO}/d/#/inicio`, cfg));
  assert.ok(paginaPropria(`${CHAMADOS}/#handoff=abc`, cfg));
  assert.ok(paginaPropria(ORC_URL, cfg));
  assert.ok(!paginaPropria('http://127.0.0.1:3334/d/', cfg), 'outra porta');
  assert.ok(!paginaPropria('http://127.0.0.1.exemplo.com:3333/', cfg));
  assert.ok(!paginaPropria('https://chamados.exemplo.test.mal.com/', cfg));
  assert.ok(!paginaPropria(pathToFileURL(path.join(ROOT, 'desktop', 'titlebar.html')).href, cfg), 'a barra de título não pega o microfone');
  assert.ok(!paginaPropria(pathToFileURL(path.join(ROOT, 'modules', 'orcamentos-fora', 'x.html')).href, cfg), 'pasta vizinha com o mesmo começo');
  assert.ok(!paginaPropria(undefined, cfg));
  assert.ok(!paginaPropria('about:blank', cfg));
});

test('Centro e Orçamentos (sessão padrão): microfone só com áudio e só da própria página; o resto segue o padrão', () => {
  const { pedir, checar } = instalar({ origens: () => [CENTRO], pastas: () => [PASTA_ORC], demais: true });
  assert.equal(pedir('media', { mediaTypes: ['audio'], requestingUrl: `${CENTRO}/d/` }), true);
  assert.equal(pedir('media', { mediaTypes: ['audio'], requestingUrl: ORC_URL }), true);
  assert.equal(pedir('media', { mediaTypes: ['audio', 'video'], requestingUrl: `${CENTRO}/d/` }), false, 'câmera nunca');
  assert.equal(pedir('media', { mediaTypes: ['video'], requestingUrl: ORC_URL }), false);
  assert.equal(pedir('media', { mediaTypes: [], requestingUrl: `${CENTRO}/d/` }), false);
  assert.equal(pedir('media', { mediaTypes: ['audio'], requestingUrl: 'https://exemplo.com/' }), false, 'outro site');
  assert.equal(pedir('media', {}), false);
  assert.equal(pedir('clipboard-sanitized-write', { requestingUrl: `${CENTRO}/d/` }), true, 'demais permissões como antes');
  assert.equal(checar('media', CENTRO, { mediaType: 'audio', requestingUrl: `${CENTRO}/d/` }), true);
  assert.equal(checar('media', 'file://', { mediaType: 'audio', requestingUrl: ORC_URL }), true);
  assert.equal(checar('media', CENTRO, { mediaType: 'video', requestingUrl: `${CENTRO}/d/` }), false);
  assert.equal(checar('audioCapture', CENTRO, { requestingUrl: `${CENTRO}/d/` }), true);
  assert.equal(checar('audioCapture', 'https://exemplo.com', { requestingUrl: 'https://exemplo.com/' }), false);
  assert.equal(checar('media', 'https://exemplo.com', { mediaType: 'audio' }), false);
});

test('Chamados (sessão própria): só o microfone da origem do Chamados; tudo o mais negado', () => {
  let origem = CHAMADOS;
  const { pedir, checar } = instalar({ origens: () => [origem], demais: false });
  assert.equal(pedir('media', { mediaTypes: ['audio'], requestingUrl: `${CHAMADOS}/` }), true);
  assert.equal(pedir('media', { mediaTypes: ['audio'], requestingUrl: `${CENTRO}/d/` }), false);
  assert.equal(pedir('media', { mediaTypes: ['audio'], requestingUrl: ORC_URL }), false, 'arquivos locais não contam no Chamados');
  assert.equal(pedir('notifications', { requestingUrl: `${CHAMADOS}/` }), false);
  assert.equal(pedir('geolocation', { requestingUrl: `${CHAMADOS}/` }), false);
  assert.equal(checar('media', CHAMADOS, { mediaType: 'audio', requestingUrl: `${CHAMADOS}/` }), true);
  assert.equal(checar('notifications', CHAMADOS, { requestingUrl: `${CHAMADOS}/` }), false);
  origem = undefined; // Chamados desligado: nada passa
  assert.equal(pedir('media', { mediaTypes: ['audio'], requestingUrl: `${CHAMADOS}/` }), false);
});

test('a Suíte instala a regra do microfone na sessão padrão e na view do Chamados, e leva o arquivo no pacote', () => {
  const main = read('desktop/main-unified.js');
  assert.match(main, /instalarMicrofone\(session\.defaultSession, \{[\s\S]*?origens: \(\) => \[new URL\(CENTRO_URL\)\.origin\][\s\S]*?pastas: \(\) => \[path\.dirname\(MODULES\.orcamentos\.renderer\)\][\s\S]*?demais: true/);
  assert.ok(main.indexOf('instalarMicrofone(session.defaultSession') < main.indexOf('centroView = new WebContentsView'), 'antes de criar as telas');
  const view = read('desktop/chamados-view.cjs');
  assert.match(view, /instalarMicrofone\(contents\.session, \{ origens: \(\) => \[origin\(\)\], demais: false \}\)/);
  assert.doesNotMatch(view, /callback\(false\)/);
  assert.ok(JSON.parse(read('package.json')).build.files.includes('desktop/permissoes-microfone.cjs'));
});
