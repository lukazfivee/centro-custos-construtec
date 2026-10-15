const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../public/m');

function mobile(user = { id: 1, role: 'supervisor', suiteRole: 'tecnico', nome: 'Ana' }) {
  const storage = new Map([['cc_usuario', JSON.stringify(user)], ['cc_token', 'test']]);
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', dataset: {}, value: '', events: {}, style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
      addEventListener(name, fn) { this.events[name] = fn; }, setAttribute() {}, scrollIntoView() {} });
    return nodes.get(id);
  };
  const context = { console, Intl, URLSearchParams, setTimeout, clearTimeout, setInterval: () => 0,
    requestAnimationFrame: (fn) => fn(), navigator: { userAgent: 'test', onLine: true },
    location: { hash: '', search: '', pathname: '/m/' }, history: { replaceState() {} },
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    document: { addEventListener() {}, getElementById: element, body: { contains: () => true, classList: { add() {}, remove() {}, toggle() {} } } },
    addEventListener() {}, scrollTo() {}, matchMedia: () => ({ matches: false }) };
  context.window = context;
  vm.createContext(context);
  const load = (...files) => files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context, { filename: file }));
  load('core.js');
  const CC = context.CC;
  CC.icon = () => ''; CC.screens = {}; CC.toast = () => {};
  CC.$ = (sel) => /^#[\w-]+$/.test(sel) && new RegExp(`id=["']${sel.slice(1)}["']`).test(html) ? element(sel) : null;
  CC.$$ = () => [];
  let html = '';
  CC.render = (markup) => { html = markup; return element('page'); };
  CC.avatar = () => ''; CC.perfilFoto = null; CC.obraNf = () => {};
  CC.header = () => ''; CC.staleNote = () => ''; CC.suitePill = () => ''; CC.wireTx = () => {};
  const records = new Map();
  CC.store = { get: async (_, key) => records.get(key), all: async () => [...records.values()],
    put: async (_, value) => records.set(value.client_id || value.key, { ...value }), del: async (_, key) => records.delete(key) };
  CC.cached = async (_, route) => ({ data: route === '/auth/me' ? { suiteRole: user.suiteRole || 'tecnico', permissoes: [] } : {} });
  CC.api = (route) => CC.cached('me', route);
  load('screen-servico.js');
  CC.queue = { ops: async () => [], mine: async () => [], state: {} };
  return { CC, context, storage, element, load, records, html: () => html };
}

test('papel canônico Técnico bloqueia p2 antigo sem bloquear execução', async () => {
  const { CC } = mobile();
  CC.cached = async () => ({ data: { suiteRole: 'tecnico', permissoes: ['p2', 'p5', 'p6'] } });
  await CC.sv.loadPerms();
  assert.equal(CC.sv.can('p2'), false);
  assert.equal(CC.sv.can('p5'), false);
  assert.equal(CC.sv.campo(), true);
});

test('menu usa identidade canônica e oculta finanças e versão completa', async () => {
  const m = mobile(); m.load('screen-misc.js', 'fin-base.js');
  await m.CC.sv.loadPerms();
  await m.CC.screens.menu({});
  assert.match(m.html(), /Técnico/);
  assert.doesNotMatch(m.html(), /Supervisor|Versão completa|custos e propostas/);
  const slot = m.element('fin'); await m.CC.fin.menu(slot);
  assert.equal(slot.innerHTML, '');
});

test('navegação e chamada direta de tela financeira não executam para técnico', async () => {
  const m = mobile(); m.load('app.js');
  let calls = 0;
  m.CC.screens.lancar = () => { calls++; };
  m.CC.screens.home = () => {};
  m.CC.go('lancar');
  await m.CC.screens.lancar({});
  assert.equal(calls, 0);
  m.CC.go('home');
  const tabs = m.element('tabs').innerHTML;
  assert.doesNotMatch(tabs, /Lançar|Lançamentos/);
  assert.match(tabs, /Obras/);
});

test('lista atribuída mostra obras e serviços independentes sem valores', async () => {
  const m = mobile(); m.load('screen-home.js');
  const calls = [];
  m.CC.cached = async (_, route) => {
    calls.push(route);
    if (route === '/auth/me') return { data: { suiteRole: 'tecnico', permissoes: [] } };
    return { data: route.startsWith('/centros-custo?') ? [{ id: 1, nome: 'Obra A', situacao: 'execucao', total_comprometido: 123 }] : [{ id: 2, codigo: 'S2', nome: 'Serviço B', situacao: 'agendado', gastos: 999 }] };
  };
  await m.CC.screens.obras({});
  assert.match(m.html(), /Obra A/); assert.match(m.html(), /Serviço B/);
  assert.doesNotMatch(m.html(), /Gasto|Receita|orçado|R\$|Contratado/);
  assert.equal(calls.some((route) => route.includes('portfolio-summary')), false);
});

test('obra técnica ignora abas financeiras e mantém dados operacionais', async () => {
  const m = mobile(); m.load('screen-obra.js');
  m.CC.cached = async (_, route) => ({ data: route === '/auth/me' ? { suiteRole: 'tecnico', permissoes: [] }
    : { centro: { id: 5, nome: 'Obra vinculada', local: 'Rua A', descricao: 'Revisar instalação', situacao: 'execucao', orcamento: 100, total_despesas: 90 }, lancamentos: [] } });
  await m.CC.screens.obra({ id: 5, tab: 'orcado' });
  assert.match(m.html(), /Rua A|Revisar instalação/);
  assert.doesNotMatch(m.html(), /Lançar|Caixa|Orçado|Resultado|Gasto|R\$/);
});

test('serviço técnico ignora Lançamentos e oferece campo sem p2', async () => {
  const m = mobile(); m.load('screen-servico-fila.js', 'screen-servico-registros.js', 'screen-servico-exec.js');
  m.CC.cached = async (_, route) => ({ data: route === '/auth/me' ? { suiteRole: 'tecnico', permissoes: [] }
    : { id: 7, codigo: 'S7', nome: 'Revisão', situacao: 'agendado', descricao: 'Testar', local: 'Rua B', gastos: [], fotos: [], checklist: [] } });
  await m.CC.screens.servico({ id: 7, tab: 'lanc' });
  assert.doesNotMatch(m.html(), /Lançamentos|Lançar despesa|Gastos|R\$/);
  await m.CC.screens.servico({ id: 7, tab: 'exec' });
  assert.match(m.html(), /Registrar observações|Editar relato/);
  assert.match(m.html(), /Coletar assinatura/);
  assert.match(m.html(), /Novo item do checklist/);
  assert.doesNotMatch(m.html(), /data-item="[^"]+" disabled/);
});

test('fila técnica preserva despesa antiga sem enviar ou reativar e envia campo', async () => {
  const m = mobile(); m.load('queue.js');
  m.CC.store = { get: async (_, key) => m.records.get(key), all: async () => [...m.records.values()],
    put: async (_, value) => m.records.set(value.client_id, { ...value }), del: async (_, key) => m.records.delete(key) };
  const old = { client_id: 'financeiro-antigo', owner: '1', payload: { valor: 120 }, estado: 'erro', criado_em: 1 };
  m.records.set(old.client_id, old);
  m.records.set('despesa-pendente', { client_id: 'despesa-pendente', owner: '1', payload: { valor: 20 }, estado: 'fila', criado_em: 0 });
  m.records.set('campo', { client_id: 'campo', owner: '1', servicoId: 7, op: 'foto', estado: 'fila', criado_em: 2 });
  const calls = [];
  m.CC.api = async (route) => { calls.push(route); return { data: { id: 1 } }; };
  m.CC.sv.sendOp = async (item) => { m.records.delete(item.client_id); };
  await m.CC.queue.retry(old.client_id);
  assert.equal(m.records.get(old.client_id).estado, 'erro');
  assert.deepEqual(calls, []);
  assert.deepEqual(m.records.get(old.client_id), old);
  assert.equal(m.records.has('despesa-pendente'), true);
  assert.equal(m.records.has('campo'), false);
  assert.equal((await m.CC.queue.mine()).length, 0);
  assert.equal(m.CC.queue.state.errors, 0);
  await m.CC.queue.discard(old.client_id);
  assert.equal(m.records.has(old.client_id), true, 'chamada direta não descarta pendência financeira antiga');
  await assert.rejects(m.CC.queue.add({ client_id: 'nova', payload: { valor: 1 } }), /operacional|permissão/i);
});

test('técnico não carrega notificações financeiras nem recebe link para elas', async () => {
  const m = mobile(); m.load('screen-avisos.js');
  const calls = []; m.CC.api = async (route) => { calls.push(route); return { data: { unread: 1 } }; };
  await m.CC.notif.refresh();
  assert.deepEqual(calls, []);
  assert.equal(m.CC.bellBtn(), '');
});

test('perfil exibe o papel canônico mesmo com resposta antiga Supervisor', async () => {
  const m = mobile(); m.load('screen-perfil.js');
  await m.CC.screens.perfil({ data: { nome: 'Ana', email: 'ana@example.test', perfil: 'supervisor' } });
  assert.match(m.html(), /Técnico/);
  assert.doesNotMatch(m.html(), /Supervisor/);
});

test('outros perfis conservam permissão financeira e navegação', async () => {
  const m = mobile({ id: 2, role: 'admin', suiteRole: 'admin' }); m.load('app.js');
  let calls = 0; m.CC.screens.lancar = () => { calls++; };
  m.CC.go('lancar');
  assert.equal(calls, 1);
  assert.equal(m.CC.sv.can('p2'), true);
  assert.match(m.element('tabs').innerHTML, /Lançamentos/);
});

test('editor administrativo converte técnico legado global em atribuições explícitas preservadas', async () => {
  const m = mobile({ id: 2, role: 'admin', suiteRole: 'admin' });
  const calls = [];
  m.CC.adm = { guard: async () => true, top: () => '', voltar() {} };
  m.CC.usu = { PAPEIS: [['tecnico', 'Técnico', 'Campo']], APPS: [['centro', 'Centro']], ESCOPADOS: ['tecnico'], GRUPOS: [],
    matriz: async () => ({ matriz: {} }), lista: (data) => data, nomePapel: (papel) => papel };
  m.CC.busy = () => {}; m.CC.go = () => {};
  m.CC.api = async (route, options) => {
    if (route === '/centros-custo') return { data: [{ id: 2, codigo: 'S2', nome: 'Serviço independente' }] };
    if (route === '/usuarios') return { data: [{ id: 3, nome: 'João', email: 'joao@example.test', suiteRole: 'tecnico', todasObras: true, obras: [2], apps: ['centro'] }] };
    calls.push([route, options.body]); return { data: {} };
  };
  m.load('screen-usuario-form.js');
  await m.CC.screens['usuario-form']({ id: 3, convitesOk: false });
  const scope = m.element('#uf-obras').innerHTML;
  assert.doesNotMatch(scope, /Todas as obras|data-todas/);
  assert.match(scope, /data-obra="2" aria-pressed="true"/);
  await m.element('#uf-salvar').events.click();
  assert.equal(calls[0][0], '/usuarios/3/acesso');
  assert.deepEqual(Array.from(calls[0][1].obras), [2]);
});

test('resposta antiga do início não renderiza sobre o detalhe aberto depois', async () => {
  const m = mobile({ id: 2, role: 'admin', suiteRole: 'admin' }); m.load('screen-home.js');
  m.CC.nav = 1;
  await m.CC.sv.loadPerms();
  let finish, began;
  const waiting = new Promise((resolve) => { began = resolve; });
  m.CC.cached = () => { began(); return new Promise((resolve) => { finish = resolve; }); };
  const home = m.CC.screens.home({ __nav: 1 });
  await waiting;
  m.CC.nav = 2; m.CC.render('<h1>Obra atual</h1>');
  finish({ data: { porCentro: [] } }); await home;
  assert.equal(m.html(), '<h1>Obra atual</h1>');
});

test('erro offline do serviço orienta técnico a registros operacionais', async () => {
  const m = mobile(), page = m.element('erro');
  m.CC.render = () => page; m.CC.$ = () => m.element('botao');
  m.CC.cached = async () => { throw new m.CC.ApiError(0, 'Sem internet.'); };
  await m.CC.screens.servico({ id: 7 });
  assert.doesNotMatch(page.innerHTML, /lançar despesas/);
});

test('novo login da mesma conta descarta permissões da sessão administrativa anterior', async () => {
  const m = mobile({ id: 1, role: 'admin', suiteRole: 'admin' });
  let requests = 0;
  m.load('core.js');
  m.CC.api = async () => { requests++; return { data: m.CC.session.token() === 'test'
    ? { suiteRole: 'admin', permissoes: ['p2', 'p5'] } : { suiteRole: 'tecnico', permissoes: [] } }; };
  await m.CC.sv.loadPerms();
  assert.equal(m.CC.sv.can('p2'), true);
  m.CC.session.clear();
  m.CC.session.save({ token: 'nova-sessao', usuario: { id: 1, role: 'supervisor', suiteRole: 'tecnico' }, instancia: {} });
  assert.equal(m.CC.sv.role(), 'tecnico');
  assert.equal(m.CC.sv.can('p2'), false);
  await m.CC.sv.loadPerms();
  assert.equal(requests, 2);
  assert.equal(m.CC.sv.role(), 'tecnico');
  assert.equal(m.CC.sv.campo(), true);
});

test('resposta de auth/me do token anterior não altera perfil ou usuário da sessão nova', async () => {
  const m = mobile({ id: 1, role: 'admin', suiteRole: 'admin' });
  let finish;
  m.CC.cached = (_, route) => m.CC.api(route);
  m.CC.api = () => new Promise((resolve) => { finish = resolve; });
  const previous = m.CC.sv.loadPerms();
  m.CC.session.save({ token: 'nova-sessao', usuario: { id: 1, role: 'supervisor', suiteRole: 'tecnico' }, instancia: {} });
  m.CC.api = async () => ({ data: { suiteRole: 'tecnico', permissoes: [] } });
  await m.CC.sv.loadPerms();
  finish({ data: { suiteRole: 'admin', permissoes: ['p2', 'p5'] } }); await previous;
  assert.equal(m.CC.sv.role(), 'tecnico');
  assert.equal(m.CC.session.user().suiteRole, 'tecnico');
  assert.equal(m.CC.sv.can('p2'), false);
});

test('login offline não recupera perfil administrativo antigo do cache por id', async () => {
  const m = mobile();
  m.records.set('1|me', { key: '1|me', data: { suiteRole: 'admin', permissoes: ['p2'] } });
  m.load('core.js');
  m.CC.api = async () => { throw new m.CC.ApiError(0, 'Sem internet.'); };
  await m.CC.sv.loadPerms();
  assert.equal(m.CC.sv.role(), 'tecnico');
  assert.equal(m.CC.sv.can('p2'), false);
});
