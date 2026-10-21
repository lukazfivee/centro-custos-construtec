const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const nav = require('../desktop/chamados-navigation.cjs');
const { createChamadosView, PARTITION } = require('../desktop/chamados-view.cjs');

const ORIGIN = 'https://chamados.exemplo.test';
const CODE = 'A'.repeat(43);
const future = () => Math.floor(Date.now() / 1000) + 60;
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const good = () => ({ target: 'chamados', origin: ORIGIN, code: CODE, expiresAt: future() });

test('applyDefaults liga o Chamados no app instalado e deixa o .env mandar', () => {
  const empty = {};
  nav.applyDefaults(empty);
  assert.equal(empty.CHAMADOS_ENABLED, 'true');
  assert.equal(nav.configuredOrigin(empty), nav.DEFAULT_ORIGIN);
  const off = { CHAMADOS_ENABLED: 'false' };
  nav.applyDefaults(off);
  assert.equal(nav.configuredOrigin(off), undefined, 'CHAMADOS_ENABLED=false desliga');
  const own = { CHAMADOS_PUBLIC_ORIGIN: ORIGIN };
  nav.applyDefaults(own);
  assert.equal(nav.configuredOrigin(own), ORIGIN);
});

test('origem do Chamados: só https puro, sem caminho, usuário, consulta ou fragmento', () => {
  for (const bad of ['http://x.test', 'https://x.test/a', 'https://u:p@x.test/', 'https://x.test/?a=1', 'https://x.test/#h', 'javascript:1', '', undefined]) {
    assert.equal(nav.validOrigin(bad), undefined, String(bad));
  }
  assert.equal(nav.validOrigin(ORIGIN), ORIGIN);
  assert.equal(nav.sameOrigin(ORIGIN + '/x?y=1#z', ORIGIN), true);
  assert.equal(nav.sameOrigin('https://outro.test/', ORIGIN), false);
  assert.equal(nav.sameOrigin('http://chamados.exemplo.test/', ORIGIN), false);
  assert.equal(nav.sameOrigin('about:blank', ORIGIN), false);
});

test('handoff: código de 43 caracteres base64url, mesma origem e validade', async () => {
  const module = { origin: ORIGIN };
  const call = (fetcher, extra = {}) => nav.requestChamadosHandoff({ module, port: 3333, token: 't', fetcher, ...extra });
  assert.deepEqual(await call(reply(200, good())), { ok: true, url: `${ORIGIN}/#handoff=${CODE}` });
  for (const patch of [{ code: 'curto' }, { code: CODE + 'A' }, { code: 'A'.repeat(42) + '+' }, { origin: 'https://outro.test' },
    { target: 'orcamentos' }, { expiresAt: 1 }, { expiresAt: 'x' }]) {
    assert.equal((await call(reply(200, { ...good(), ...patch }))).ok, false, JSON.stringify(patch));
  }
  assert.match((await call(reply(403, {}))).message, /não tem acesso ao Chamados/);
  assert.match((await call(reply(409, {}))).message, /contas corporativas/);
  assert.equal((await call(async () => { throw new Error('rede'); })).ok, false);
  assert.match((await call(reply(200, good()), { token: null })).message, /Entre no Centro/);
  assert.match((await call(reply(200, good()), { module: { origin: undefined } })).message, /não está configurado/);
  assert.equal((await call(reply(200, good()), { port: 0 })).ok, false);
});

test('handoff: o pedido vai só ao servidor local, com POST, sem seguir redirecionamento e só com target chamados', async () => {
  let seen;
  await nav.requestChamadosHandoff({
    module: { origin: ORIGIN }, port: 3333, token: 'tok',
    fetcher: async (request) => { seen = request; return new Response(JSON.stringify(good())); },
  });
  assert.equal(seen.url, 'http://127.0.0.1:3333/api/auth/suite-handoff');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.redirect, 'error');
  assert.equal(seen.headers.get('authorization'), 'Bearer tok');
  assert.deepEqual(await seen.json(), { target: 'chamados' });
});

// ---- Janela: a view do Chamados com Electron simulado ----

function harness({ tokens = ['tok-1'], fetches = [], answers = [] } = {}) {
  const log = { loads: [], external: [], boxes: [], errors: [], cleared: 0, shell: [], perms: {}, views: [], failLoad: 0 };
  class Contents {
    constructor() {
      this.handlers = {};
      this.url = '';
      this.mainFrame = { url: '' };
      this.session = {
        setPermissionRequestHandler: (fn) => { log.perms.request = fn; },
        setPermissionCheckHandler: (fn) => { log.perms.check = fn; },
      };
    }
    isDestroyed() { return false; }
    getURL() { return this.url; }
    async loadURL(url) {
      log.loads.push(url);
      if (log.failLoad > 0) { log.failLoad -= 1; throw Object.assign(new Error('falha'), { errno: -105 }); }
      this.url = url;
      this.mainFrame.url = url;
    }
    setWindowOpenHandler(fn) { this.openHandler = fn; }
    on(name, fn) { this.handlers[name] = fn; }
  }
  class View {
    constructor(options) { this.options = options; this.webContents = new Contents(); log.views.push(this); }
    setBackgroundColor() {}
    setVisible(value) { this.visible = value; }
  }
  const window = { isDestroyed: () => false, contentView: { children: [], addChildView(view) { this.children.push(view); } } };
  const queue = [...fetches];
  const controller = createChamadosView({
    electron: {
      WebContentsView: View,
      session: { fromPartition: (name) => { log.partition = name; return { clearStorageData: async (options) => { if (options?.storages) log.shell.push(options.storages.join(',')); else log.cleared += 1; } }; } },
      shell: { openExternal: (url) => { log.external.push(url); } },
      dialog: {
        showMessageBox: async (_window, options) => { log.boxes.push(options); return { response: answers.length ? answers.shift() : 1 }; },
        showErrorBox: (title, text) => { log.errors.push([title, text]); },
      },
    },
    host: {
      getWindow: () => window, module: { origin: ORIGIN }, port: 3333, preload: '/p/chamados-preload.js',
      readToken: async () => (tokens.length > 1 ? tokens.shift() : tokens[0]),
      fetcher: async () => (queue.length ? queue.shift() : reply(200, good())()),
    },
  });
  return { controller, log, window };
}

test('o Chamados abre numa view da mesma janela, com sessão própria e permissões restritas', async () => {
  const { controller, log, window } = harness();
  assert.deepEqual(await controller.open(), { switched: true });
  const [view] = log.views;
  assert.equal(window.contentView.children.length, 1);
  const prefs = view.options.webPreferences;
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webviewTag, false);
  assert.equal(log.partition, PARTITION);
  assert.match(PARTITION, /^persist:/, 'sessão persistente e separada do Centro e do Orçamentos');
  assert.equal(prefs.preload, '/p/chamados-preload.js');
  assert.deepEqual(prefs.additionalArguments, ['--chamados-origin=' + ORIGIN]);
  assert.deepEqual(log.loads, ['about:blank', `${ORIGIN}/#handoff=${CODE}`]);
  let granted = null;
  log.perms.request({}, 'media', (value) => { granted = value; });
  assert.equal(granted, false);
  assert.equal(log.perms.check(), false);
});

test('mesma conta e tela carregada: só mostra, sem pedir outro código', async () => {
  const { controller, log } = harness();
  await controller.open();
  const loads = log.loads.length;
  assert.deepEqual(await controller.open(), { switched: true });
  assert.equal(log.loads.length, loads, 'não recarrega nem usa outro código');
});

test('outra conta no Centro: limpa a sessão do Chamados e entra com código novo', async () => {
  const { controller, log } = harness({ tokens: ['tok-1', 'tok-2'] });
  await controller.open();
  await controller.open();
  assert.equal(log.cleared, 1);
  assert.equal(log.loads.filter((url) => url.includes('#handoff=')).length, 2);
});

test('sem sessão no Centro o Chamados não abre e a sessão dele é apagada', async () => {
  const { controller, log } = harness({ tokens: [null] });
  assert.deepEqual(await controller.open(), { switched: false });
  assert.equal(log.cleared, 1);
  assert.match(log.errors[0][1], /Entre no Centro de Custos/);
});

test('falha na entrada mostra o motivo e permite tentar de novo sem fechar o app', async () => {
  const { controller, log } = harness({ fetches: [reply(503, {})()], answers: [0] });
  assert.deepEqual(await controller.open(), { switched: true });
  assert.equal(log.boxes.length, 1);
  assert.deepEqual(log.boxes[0].buttons, ['Tentar de novo', 'Cancelar']);
  assert.match(log.boxes[0].detail, /Não foi possível validar/);
});

test('cancelar a nova tentativa volta sem trocar de tela; falha de carga também oferece nova tentativa', async () => {
  const cancelled = harness({ fetches: [reply(403, {})()], answers: [1] });
  assert.deepEqual(await cancelled.controller.open(), { switched: false });
  assert.match(cancelled.log.boxes[0].detail, /não tem acesso/);
  const offline = harness({ answers: [0] });
  offline.log.failLoad = 2; // about:blank e a carga do site
  assert.deepEqual(await offline.controller.open(), { switched: true });
  assert.match(offline.log.boxes[0].detail, /Sem conexão com o Chamados/);
});

test('a view só navega na origem do Chamados; o resto abre no navegador', async () => {
  const { controller, log } = harness();
  await controller.open();
  const contents = log.views[0].webContents;
  const attempt = (name, url) => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    contents.handlers[name](event, url);
    return event.prevented;
  };
  assert.equal(attempt('will-navigate', ORIGIN + '/chamados/1'), false);
  assert.equal(attempt('will-navigate', 'https://outro.test/x'), true);
  assert.equal(attempt('will-navigate', 'file:///C:/Windows/win.ini'), true);
  assert.deepEqual(log.external, ['https://outro.test/x'], 'file: nunca vai para o sistema');
  assert.equal(attempt('will-redirect', 'https://evil.test/'), true);
  assert.deepEqual(contents.openHandler({ url: 'https://wa.me/55' }), { action: 'deny' });
  assert.equal(log.external.at(-1), 'https://wa.me/55');
  assert.deepEqual(contents.openHandler({ url: 'javascript:alert(1)' }), { action: 'deny' });
  assert.equal(log.external.length, 3);
  assert.deepEqual(contents.openHandler({ url: ORIGIN + '/relatorio' }), { action: 'deny' });
  assert.equal(log.loads.at(-1), ORIGIN + '/relatorio', 'janela da mesma origem abre na própria view');
  let blocked = false;
  contents.handlers['will-attach-webview']({ preventDefault: () => { blocked = true; } });
  assert.equal(blocked, true);
});

test('só a página principal do Chamados fala com o app pelo IPC', async () => {
  const { controller, log } = harness();
  assert.equal(controller.isSender({ sender: {}, senderFrame: {} }), false, 'antes de abrir');
  await controller.open();
  const contents = log.views[0].webContents;
  assert.equal(controller.isSender({ sender: contents, senderFrame: contents.mainFrame }), true);
  assert.equal(controller.isSender({ sender: contents, senderFrame: { url: ORIGIN + '/' } }), false, 'subquadro');
  assert.equal(controller.isSender({ sender: {}, senderFrame: contents.mainFrame }), false);
  contents.mainFrame.url = 'https://outro.test/';
  assert.equal(controller.isSender({ sender: contents, senderFrame: contents.mainFrame }), false, 'outra origem');
});

test('o preload do Chamados só expõe a troca de tela, e só na origem configurada', async () => {
  const source = read('desktop/chamados-preload.js');
  assert.match(source, /location\.origin === origin/);
  assert.match(source, /suiteAvailable: true/);
  assert.match(source, /ipcRenderer\.invoke\('suite:switch', target\)/);
  assert.doesNotMatch(source, /executeJavaScript|openExternal|ipcRenderer\.send|child_process/);
  const calls = [];
  const run = (pageOrigin) => {
    const electron = { contextBridge: { exposeInMainWorld: (name, api) => calls.push([name, api]) }, ipcRenderer: { invoke: async (...args) => args } };
    const fn = new Function('require', 'process', 'location', source);
    fn((name) => { assert.equal(name, 'electron'); return electron; }, { argv: ['x', '--chamados-origin=' + ORIGIN] }, { origin: pageOrigin });
  };
  run('https://outro.test');
  assert.equal(calls.length, 0, 'página fora da origem não recebe ponte');
  run(ORIGIN);
  assert.equal(calls[0][0], 'electronAPI');
  assert.equal(calls[0][1].suiteAvailable, true);
  assert.deepEqual(await calls[0][1].suiteSwitch('centro'), ['suite:switch', 'centro']);
  assert.deepEqual(await calls[0][1].suiteSwitch('../x'), { switched: false });
});

test('a janela da Suíte tem Chamados como terceira tela, com barra de título e atalho', () => {
  const main = read('desktop/main-unified.js');
  assert.match(main, /const TARGETS = \['centro', 'orcamentos', 'chamados'\]/);
  assert.match(main, /createChamadosView\(/);
  assert.match(main, /chamados\.open\(\)/);
  assert.doesNotMatch(main, /openChamados/, 'o Chamados não abre mais no navegador');
  assert.match(main, /Suíte Construtec — \$\{TITLES\[target\]\}/, 'o título da janela acompanha a tela ativa');
  assert.match(main, /chamados: 'Chamados e O\.S\.'/);
  assert.match(main, /chamados\?\.isSender\(event\)/, 'IPC do Chamados confere a origem da página');
  assert.match(main, /applyChamadosDefaults\(process\.env\)/);
  assert.match(read('desktop/titlebar.js'), /chamados: 'Chamados e O\.S\.'/);
  assert.match(read('desktop/preload.js'), /suiteAvailable: true/);
  const pkg = JSON.parse(read('package.json'));
  for (const file of ['desktop/chamados-navigation.cjs', 'desktop/chamados-view.cjs', 'desktop/chamados-preload.js']) {
    assert.ok(pkg.build.files.includes(file), `${file} entra no pacote`);
  }
});

test('service worker e cache do Chamados são descartados uma vez por execução, sem apagar o login', async () => {
  const { controller, log } = harness({ tokens: ['tok-1', 'tok-2'] });
  await controller.open();
  await controller.open();
  assert.deepEqual(log.shell, ['serviceworkers,cachestorage']);
  assert.equal(log.cleared, 1, 'só a limpeza de outra conta; o descarte do service worker não apaga o login');
});
