const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../public/m');
const activity = (id = 7, dia = '2026-10-15') => ({ id, dia, ordem: id, orientacao: 'Revisar instalação', revision: 1,
  centro: { id: id + 10, tipo: id === 7 ? 'obra' : 'servico', nome: `Destino ${id}`, codigo: `D${id}`, cliente: 'CEMED <Ondina>' },
  participantes: [{ id: 1, nome: 'Ana', estado: 'pendente', revision: 0, ativo: true },
    { id: 2, nome: 'Beto', estado: 'concluido', revision: 3, ativo: true }],
  eventos: [{ id: 1, usuarioId: 2, nome: 'Beto', estado: 'concluido', observacao: 'Tudo testado', criadoEm: '2026-10-15T12:00:00Z', tipo: 'andamento' }] });

function mobile({ offline = false, role = 'tecnico' } = {}) {
  const storage = new Map([['cc_token', 'sessao-a'], ['cc_usuario', JSON.stringify({ id: 1, nome: 'Ana', suiteRole: role })]]);
  const nodes = new Map(), records = new Map();
  let html = '';
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', dataset: {}, events: {}, disabled: false, hidden: false,
      innerHTML: '', textContent: '', style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
      addEventListener(name, fn) { this.events[name] = fn; }, setAttribute() {}, focus() {} });
    return nodes.get(selector);
  };
  const context = { console, Intl, Date, Math, URLSearchParams, setTimeout, clearTimeout, setInterval: () => 0,
    crypto: require('node:crypto').webcrypto, TextEncoder, navigator: { onLine: !offline, userAgent: 'test' },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, val) => storage.set(key, val), removeItem: (key) => storage.delete(key) },
    document: { getElementById: (id) => id === 'netbar' ? null : node(id), addEventListener() {},
      body: { classList: { add() {}, remove() {}, toggle() {} } } },
    addEventListener() {}, matchMedia: () => ({ matches: false }), requestAnimationFrame: (fn) => fn(),
    location: { hash: '', pathname: '/m/', search: '' }, history: { replaceState() {} } };
  context.window = context; vm.createContext(context);
  const load = (...names) => names.forEach((name) => { if (fs.existsSync(path.join(dir, name))) vm.runInContext(fs.readFileSync(path.join(dir, name), 'utf8'), context, { filename: name }); });
  load('core.js', 'queue.js');
  const CC = context.CC;
  CC.store = { put: async (store, value) => records.set(`${store}:${value.key || value.client_id}`, structuredClone(value)),
    get: async (store, key) => records.get(`${store}:${key}`),
    del: async (store, key) => records.delete(`${store}:${key}`),
    all: async (store) => [...records].filter(([key]) => key.startsWith(`${store}:`)).map(([, value]) => structuredClone(value)) };
  CC.screens = {}; CC.sv = { role: () => role, can: () => role !== 'tecnico' };
  CC.icon = () => ''; CC.header = () => ''; CC.staleNote = (r) => r.stale ? 'Dados salvos' : '';
  CC.render = (markup) => { html = markup; return node('page'); };
  CC.$ = (selector) => node(selector);
  CC.$$ = (selector) => {
    const attr = /^\[([^\]]+)\]$/.exec(selector);
    if (!attr) return [];
    return [...html.matchAll(new RegExp(`${attr[1]}="([^"]*)"`, 'g'))].map((match) => {
      const el = node(`${attr[1]}=${match[1]}`);
      const key = attr[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      el.dataset[key] = match[1]; return el;
    });
  };
  CC.nav = 1; CC.toast = () => {}; CC.today = () => '2026-10-15';
  CC.errorScreen = (_, error) => { html = `Erro: ${error.message}`; };
  const destinations = []; CC.go = (...args) => destinations.push(args);
  CC.homeTecnico = async () => { html = 'Trabalho legado'; };
  load('programacao-fila.js', 'screen-meu-dia.js', 'screen-programacao-atividade.js');
  if (CC.programacaoFila) CC.programacaoFila.hoje = () => '2026-10-15';
  return { CC, records, context, storage, node, destinations, load, html: () => html };
}

test('entrada corporativa redireciona antes de consultar dados e cache locais', async () => {
  const m = mobile(); let redirects = 0;
  m.CC.programacaoNuvem = async (current) => { assert.ok(current()); redirects++; return true; };
  m.CC.api = async () => { assert.fail('Não deve consultar agenda local após redirecionar'); };
  await m.CC.homeTecnico({ __nav: 1 });
  await m.CC.screens['atividade-dia']({ id: 7, __nav: 1 });
  assert.equal(redirects, 2);
});

test('Meu dia lista destinos independentes, progresso individual e mantém trabalhos anteriores', async () => {
  const m = mobile();
  m.CC.api = async () => ({ data: { dia: '2026-10-15', atividades: [activity(), activity(8)] } });
  await m.CC.homeTecnico({ __nav: 1 });
  assert.match(m.html(), /Meu dia/);
  assert.match(m.html(), /Destino 7/); assert.match(m.html(), /Destino 8/);
  assert.match(m.html(), /CEMED &lt;Ondina&gt;/);
  assert.match(m.html(), /Obra/); assert.match(m.html(), /Serviço/);
  assert.match(m.html(), /Ana/); assert.match(m.html(), /Beto/);
  assert.match(m.html(), /1 de 2/); assert.match(m.html(), /Minhas obras e serviços/);
  await m.CC.screens['meus-trabalhos']({ __nav: 1 }); assert.equal(m.html(), 'Trabalho legado');
});

test('detalhe mostra timeline da equipe, execução e controles do próprio andamento', async () => {
  const m = mobile(); assert.equal(typeof m.CC.screens['atividade-dia'], 'function');
  m.CC.api = async () => ({ data: activity() });
  await m.CC.screens['atividade-dia']({ id: 7, __nav: 1 });
  assert.match(m.html(), /Tudo testado/); assert.match(m.html(), /Beto/);
  assert.match(m.html(), /Meu andamento/); assert.match(m.html(), /Abrir execução/);
  m.node('data-pg-estado=pausado').events.click(); m.node('#pg-observacao').value = 'Falta quadro';
  m.context.navigator.onLine = false;
  await m.node('#pg-salvar').events.click();
  const [item] = await m.CC.queue.ops();
  assert.equal(item.atividadeId, 7); assert.equal(item.body.estado, 'pausado');
  assert.equal(item.body.observacao, 'Falta quadro'); assert.equal(item.body.revision, 0);
  assert.equal(item.servicoId, undefined); assert.equal(item.body.usuarioId, undefined);
});

test('futuro e escritório consultam detalhe sem alterar andamento de técnico', async () => {
  for (const opts of [{}, { role: 'admin' }]) {
    const m = mobile(opts); assert.equal(typeof m.CC.screens['atividade-dia'], 'function');
    m.CC.api = async () => ({ data: activity(7, opts.role ? '2026-10-15' : '2026-10-16') });
    await m.CC.screens['atividade-dia']({ id: 7, __nav: 1 });
    assert.doesNotMatch(m.html(), /id="pg-salvar"/);
  }
});

test('fila encadeia revisões locais, aplica overlay próprio e envia sem despesas', async () => {
  const m = mobile({ offline: true }); assert.ok(m.CC.programacaoFila);
  await m.CC.programacaoFila.salvar(activity(), 'em_andamento', 'Iniciei');
  await m.CC.programacaoFila.salvar(activity(), 'pausado', 'Falta material');
  const ops = await m.CC.queue.ops();
  assert.equal(ops.length, 2); assert.equal(ops[0].body.revision, 0); assert.equal(ops[1].body.revision, 1);
  assert.notEqual(ops[0].client_id, ops[1].client_id);
  const over = await m.CC.programacaoFila.overlay(activity());
  assert.equal(over.participantes[0].estado, 'pausado'); assert.equal(over.participantes[1].estado, 'concluido');
  assert.equal(activity().participantes[0].estado, 'pendente');
  const calls = []; m.context.navigator.onLine = true;
  m.CC.api = async (route, options) => { calls.push([route, options.body]); return { data: activity() }; };
  await m.CC.queue.run();
  assert.equal(calls.length, 2); assert.equal(calls[0][0], '/programacao/7/atualizacoes');
  assert.equal(calls[1][1].revision, 1); assert.equal(calls[0][1].clientId, ops[0].client_id);
  assert.equal((await m.CC.queue.ops()).length, 0);
  await assert.rejects(m.CC.queue.add({ client_id: 'gasto', payload: { valor: 2 } }), /operacional|permissão/);
});

test('conflito preserva texto, bloqueia dependentes e não impede outro destino', async () => {
  const m = mobile({ offline: true }); assert.ok(m.CC.programacaoFila);
  await m.CC.programacaoFila.salvar(activity(), 'em_andamento', 'Local importante');
  await m.CC.programacaoFila.salvar(activity(), 'pausado', 'Segundo texto');
  await m.CC.programacaoFila.salvar(activity(8), 'concluido', 'Outro destino');
  m.context.navigator.onLine = true; const sent = [];
  m.CC.api = async (route) => { sent.push(route); if (route.includes('/7/')) throw new m.CC.ApiError(409, 'Atualizado em outro aparelho'); return { data: activity(8) }; };
  await m.CC.queue.run(); await m.CC.queue.run();
  assert.deepEqual(sent, ['/programacao/7/atualizacoes', '/programacao/8/atualizacoes']);
  const ops = await m.CC.queue.ops(); assert.equal(ops.length, 2);
  assert.equal(ops[0].estado, 'erro'); assert.equal(ops[0].body.observacao, 'Local importante');
  assert.equal(ops[1].body.observacao, 'Segundo texto');
});

test('403 não apaga fila nem usa cache e outra conta não recebe operação', async () => {
  const m = mobile({ offline: true }); assert.ok(m.CC.programacaoFila);
  await m.CC.programacaoFila.salvar(activity(), 'pausado', 'Rascunho mantido');
  m.context.navigator.onLine = true;
  m.CC.api = async () => { throw new m.CC.ApiError(403, 'Acesso retirado'); };
  await m.CC.queue.run(); assert.equal((await m.CC.queue.ops())[0].body.observacao, 'Rascunho mantido');
  await assert.rejects(m.CC.programacaoFila.cached('dia', '/programacao?dia=2026-10-15'), (e) => e.status === 403);
  m.storage.set('cc_usuario', JSON.stringify({ id: 9, suiteRole: 'tecnico' }));
  assert.equal((await m.CC.queue.ops()).length, 0);
});

test('resposta anterior não pinta nova tela nem guarda dados na conta trocada', async () => {
  const m = mobile(); assert.ok(m.CC.programacaoFila);
  let finish; m.CC.api = () => new Promise((resolve) => { finish = resolve; });
  const pending = m.CC.homeTecnico({ __nav: 1 });
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
  m.CC.nav = 2; m.CC.render('Tela nova');
  m.storage.set('cc_token', 'sessao-b'); m.storage.set('cc_usuario', JSON.stringify({ id: 2, suiteRole: 'tecnico' }));
  finish({ data: { atividades: [activity()] } }); await pending;
  assert.equal(m.html(), 'Tela nova');
  assert.equal([...m.records.keys()].some((key) => key.startsWith('cache:')), false);
});

test('troca de conta durante sync não envia próximos itens na sessão nova', async () => {
  const m = mobile({ offline: true }); assert.ok(m.CC.programacaoFila);
  await m.CC.programacaoFila.salvar(activity(), 'em_andamento', 'A');
  await m.CC.programacaoFila.salvar(activity(8), 'em_andamento', 'B');
  let calls = 0; m.context.navigator.onLine = true;
  m.CC.api = async () => { calls++; m.storage.set('cc_token', 'novo'); m.storage.set('cc_usuario', '{"id":2}'); return { data: activity() }; };
  await m.CC.queue.run(); assert.equal(calls, 1);
});

test('cache funciona offline somente na mesma sessão e 403 remove cópia já vista', async () => {
  const m = mobile(), F = m.CC.programacaoFila;
  m.CC.api = async () => ({ data: activity() });
  await F.cached('atividade-7', '/programacao/7');
  m.CC.api = async () => { throw new m.CC.ApiError(0, 'Sem internet'); };
  assert.equal((await F.cached('atividade-7', '/programacao/7')).data.id, 7);
  m.storage.set('cc_token', 'sessao-nova-mesma-conta');
  await assert.rejects(F.cached('atividade-7', '/programacao/7'), (e) => e.status === 0);
  m.storage.set('cc_token', 'sessao-a');
  m.CC.api = async () => { throw new m.CC.ApiError(403, 'Retirado'); };
  await assert.rejects(F.cached('atividade-7', '/programacao/7'), (e) => e.status === 403);
  m.CC.api = async () => { throw new m.CC.ApiError(0, 'Sem internet'); };
  await assert.rejects(F.cached('atividade-7', '/programacao/7'), (e) => e.status === 0);
});

test('duas tentativas simultâneas de sincronizar enviam cada evento uma vez', async () => {
  const m = mobile({ offline: true });
  await m.CC.programacaoFila.salvar(activity(), 'pausado', 'A');
  let calls = 0; m.context.navigator.onLine = true;
  m.CC.api = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return { data: activity() }; };
  await Promise.all([m.CC.queue.run(), m.CC.queue.run()]);
  assert.equal(calls, 1);
});

test('atualizar histórico preserva estado e texto ainda não enviados', async () => {
  const m = mobile(); m.CC.api = async () => ({ data: activity() });
  await m.CC.screens['atividade-dia']({ id: 7, __nav: 1 });
  m.node('data-pg-estado=pausado').events.click(); m.node('#pg-observacao').value = 'Texto em edição';
  assert.equal(typeof m.node('#pg-atualizar').events.click, 'function');
  m.node('#pg-atualizar').events.click();
  assert.equal(m.destinations[0][0], 'atividade-dia');
  assert.equal(m.destinations[0][1].rascunho.observacao, 'Texto em edição');
  assert.equal(m.destinations[0][1].rascunho.estado, 'pausado');
});

test('trabalhos anteriores não confundem eventos diários com fila de serviço', async () => {
  const m = mobile({ offline: true }); m.load('screen-home-tecnico.js');
  await m.CC.programacaoFila.salvar(activity(), 'pausado', 'A');
  m.CC.cached = async () => ({ data: [] });
  await m.CC.homeTecnico({ __nav: 1 });
  assert.doesNotMatch(m.html(), /id="tc-fila"/);
});

test('404 de vínculo revogado elimina detalhe e listas guardados antes de voltar offline', async () => {
  const m = mobile(), F = m.CC.programacaoFila;
  m.CC.api = async () => ({ data: activity() });
  await F.cached('atividade-7', '/programacao/7');
  m.CC.api = async () => ({ data: { dia: '2026-10-15', atividades: [activity()] } });
  await F.cached('dia-2026-10-15', '/programacao?dia=2026-10-15');
  m.CC.api = async () => { throw new m.CC.ApiError(404, 'Atividade não encontrada.'); };
  await assert.rejects(F.cached('atividade-7', '/programacao/7'), (e) => e.status === 404);
  m.CC.api = async () => { throw new m.CC.ApiError(0, 'Sem internet'); };
  await assert.rejects(F.cached('atividade-7', '/programacao/7'), (e) => e.status === 0);
  await assert.rejects(F.cached('dia-2026-10-15', '/programacao?dia=2026-10-15'), (e) => e.status === 0);
});

test('lista atualizada retira detalhes ausentes daquele dia e preserva outras datas', async () => {
  const m = mobile(), F = m.CC.programacaoFila;
  m.CC.api = async () => ({ data: activity() });
  await F.cached('atividade-7', '/programacao/7');
  m.CC.api = async () => ({ data: activity(8, '2026-10-14') });
  await F.cached('atividade-8', '/programacao/8');
  m.CC.api = async () => ({ data: { dia: '2026-10-15', atividades: [activity()] } });
  await F.cached('dia-2026-10-15', '/programacao?dia=2026-10-15');
  m.CC.api = async () => ({ data: { dia: '2026-10-15', atividades: [] } });
  await F.cached('dia-2026-10-15', '/programacao?dia=2026-10-15');
  m.CC.api = async () => { throw new m.CC.ApiError(0, 'Sem internet'); };
  await assert.rejects(F.cached('atividade-7', '/programacao/7'), (e) => e.status === 0);
  assert.equal((await F.cached('atividade-8', '/programacao/8')).data.id, 8);
  assert.equal((await F.cached('dia-2026-10-15', '/programacao?dia=2026-10-15')).data.atividades.length, 0);
});

test('recusa do helper da nuvem impede recuperar programação revogada ao voltar offline', async () => {
  for (const status of [403, 404]) {
    for (const tela of ['meu-dia', 'atividade-dia']) {
      const m = mobile({ offline: true }); m.load('programacao-nuvem.js');
      await m.CC.programacaoFila.salvar(activity(), 'pausado', 'Nota deve continuar salva');
      m.context.navigator.onLine = true;
      m.CC.api = async (route) => ({ data: route === '/programacao/abrir-nuvem' ? {}
        : route.includes('?dia=') ? { dia: '2026-10-15', atividades: [activity()] } : activity() });
      await m.CC.screens[tela]({ id: 7, __nav: 1 });
      assert.match(m.html(), /Destino 7/);
      m.CC.api = async () => { throw new m.CC.ApiError(status, 'Acesso à programação retirado'); };
      await m.CC.screens[tela]({ id: 7, __nav: 1 });
      assert.doesNotMatch(m.html(), /Destino 7/);
      m.CC.api = async () => { throw new m.CC.ApiError(0, 'Sem internet'); };
      await m.CC.screens[tela]({ id: 7, __nav: 1 });
      assert.doesNotMatch(m.html(), /Destino 7/, `${tela}: cache não pode retornar após ${status} do helper`);
      assert.equal((await m.CC.queue.ops())[0].body.observacao, 'Nota deve continuar salva');
    }
  }
});

test('recusa atrasada do helper não invalida cache de outra conta ou novo token', async () => {
  const m = mobile(); m.load('programacao-nuvem.js');
  let finish;
  m.CC.api = () => new Promise((_, reject) => { finish = reject; });
  const old = m.CC.programacaoNuvem();
  m.storage.set('cc_token', 'sessao-b'); m.storage.set('cc_usuario', '{"id":2}');
  m.CC.api = async () => ({ data: activity(8) });
  await m.CC.programacaoFila.cached('atividade-8', '/programacao/8');
  finish(new m.CC.ApiError(403, 'Revogado na conta anterior'));
  assert.equal(await old, true);
  m.CC.api = async () => { throw new m.CC.ApiError(0, 'Sem internet'); };
  assert.equal((await m.CC.programacaoFila.cached('atividade-8', '/programacao/8')).data.id, 8);
});
