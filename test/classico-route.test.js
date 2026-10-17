const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CELULAR = 'Mozilla/5.0 (Linux; Android 14; SM-A175F) Mobile Safari/537.36';

// C8: troca de padrao. A raiz abre o Desktop novo; a interface antiga fica em /classico/ por um periodo
// (aviso: vira redirecionamento para / em cerca de 26/11/2026) e continua em /?antiga=1 e /?entrar=1.
test('/classico/ serve a interface antiga e / abre o Desktop novo', async (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'centro-custos-classico-'));
  process.env.PGLITE_DATA_DIR = path.join(tempRoot, 'database');
  process.env.RESTORE_ROOT_DIR = path.join(tempRoot, 'restore');
  process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.ADMIN_INITIAL_PASSWORD = 'senha-teste-123';
  process.env.ADMIN_INITIAL_EMAIL = 'admin@teste.local';
  delete process.env.DATABASE_URL;

  const { initializeDatabase, closeDatabase } = require('../db');
  const { createApp } = require('../server');
  await initializeDatabase();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  context.after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  // A raiz abre o Desktop novo (celular vai para /m/).
  const raiz = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(raiz.status, 302);
  assert.equal(raiz.headers.get('location'), '/d/');
  const celular = await fetch(`${base}/`, { redirect: 'manual', headers: { 'user-agent': CELULAR } });
  assert.equal(celular.headers.get('location'), '/m/');

  // /classico sem barra vai para /classico/, que entrega a interface antiga sem cache.
  const semBarra = await fetch(`${base}/classico`, { redirect: 'manual' });
  assert.equal(semBarra.status, 301);
  assert.equal(semBarra.headers.get('location'), '/classico/');
  const pagina = await fetch(`${base}/classico/`, { redirect: 'manual' });
  assert.equal(pagina.status, 200);
  assert.equal(pagina.headers.get('cache-control'), 'no-cache');
  const html = Buffer.from(await pagina.arrayBuffer());
  assert.deepEqual(html, fs.readFileSync(path.join(ROOT, 'public', 'index.html')), 'e a interface antiga, a mesma de ?antiga=1');
  assert.doesNotMatch(html.toString('utf8'), /d-core\.js/);

  // Os arquivos relativos da pagina antiga (style-base.css, app.js, assets/...) resolvem sob /classico/.
  const arquivos = { 'style-base.css': /css/, 'app.js': /javascript/, 'assets/construtec-logo.png': /image\/png/ };
  for (const [arquivo, tipo] of Object.entries(arquivos)) {
    const resposta = await fetch(`${base}/classico/${arquivo}`);
    assert.equal(resposta.status, 200, arquivo);
    assert.match(resposta.headers.get('content-type') || '', tipo, arquivo);
  }
  const app = Buffer.from(await (await fetch(`${base}/classico/app.js`)).arrayBuffer());
  assert.deepEqual(app, fs.readFileSync(path.join(ROOT, 'public', 'app.js')));
  // /m e /d reais nao ganham uma segunda copia (nem outro escopo de service worker) sob /classico.
  for (const duplicado of ['m/sw.js', 'm/', 'd/index.html']) assert.equal((await fetch(`${base}/classico/${duplicado}`)).status, 404, duplicado);

  // Compatibilidade: ?antiga=1 e ?entrar=1 seguem abrindo a mesma pagina.
  for (const consulta of ['?antiga=1', '?entrar=1']) {
    const antiga = await fetch(`${base}/${consulta}`, { redirect: 'manual' });
    assert.equal(antiga.status, 200, consulta);
    assert.deepEqual(Buffer.from(await antiga.arrayBuffer()), html, consulta);
  }

  // Ficar na interface antiga: sem ?antiga=1, o login iria para /d/. Em /classico/ ele fica.
  assert.match(ler('public/app.js'), /abrirAntiga = [^;\n]*has\('antiga'\)[^;\n]*\/classico/);
});

test('Configuracoes (Sistema) tem o link "Versao classica" com o aviso do prazo', () => {
  const tela = ler('public/d/telas/config-sistema.js');
  assert.match(tela, /<a [^>]*href="\/classico\/"[^>]*>[^<]*Versão clássica/, 'link para /classico/');
  const link = tela.match(/<a [^>]*href="\/classico\/"[^>]*>/)[0];
  assert.doesNotMatch(link, /target=/, 'abre na mesma janela: o app Windows nao abre localhost em outra');
  assert.match(tela, /26\/11\/2026/, 'aviso de que vira redirecionamento para / em cerca de 26/11/2026');
  assert.match(ler('public/index.html'), /<a [^>]*href="\/d\/"[^>]*>[\s\S]*?Desktop novo/, 'a interface antiga tem caminho de volta');
});

test('o app Windows abre o Desktop novo', () => {
  const pkg = JSON.parse(ler('package.json'));
  assert.equal(pkg.main, 'desktop/main-unified.js', 'o executavel instalado inicia o app unificado');
  assert.match(ler('desktop/main-unified.js'), /const CENTRO_URL = `http:\/\/127\.0\.0\.1:\$\{MODULES\.centro\.port\}\/d\/`;/);
  // O app antigo (so Centro) abre a raiz, que redireciona para /d/ (testado acima).
  assert.match(ler('desktop/main.js'), /const SERVER_URL = `http:\/\/127\.0\.0\.1:\$\{PORT\}`;/);
});
