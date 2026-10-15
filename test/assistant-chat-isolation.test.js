const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const S = new Proxy({}, { get: (_, kind) => (spec) => ({ kind, ...spec }) });

function chatFixture({ desktop = false, pending = false, delayedReply = false } = {}) {
  let user = { id: 1, nome: 'Admin', role: 'admin', suiteRole: 'admin', permissoes: ['p1', 'p2', 'p10', 'p12'] };
  let token = 'a', loaded = !pending, releasePermissions, releaseReply;
  const nodes = new Map(), models = [], histories = [], requests = [], imports = [], order = [];
  const makeNode = () => ({ innerHTML: '', style: { setProperty() {} }, classList: { contains: () => false }, value: '',
    addEventListener() {}, setAttribute() {}, insertAdjacentHTML(_, html) { this.innerHTML += html; }, focus() {},
    remove() { nodes.delete(this.id); }, scrollHeight: 0 });
  const document = { getElementById: (id) => nodes.get(id), querySelector: () => null, createElement: makeNode,
    addEventListener() {}, removeEventListener() {}, body: { ...makeNode(), appendChild(node) { nodes.set(node.id, node); } } };
  const CC = { esc: (v) => String(v || ''), icon: () => '', offline: () => false,
    session: { user: () => user, token: () => token }, owner: () => `${token}:${user.id}`, current: () => 'home',
    sv: { role: () => loaded ? user.suiteRole : 'admin', can: (p) => loaded && user.permissoes.includes(p),
      async loadPerms() { order.push('permissions'); if (!loaded) await new Promise((resolve) => { releasePermissions = () => { loaded = true; resolve(); }; }); } },
    $: (selector) => { const id = selector.slice(1); if (!nodes.has(id)) { const node = makeNode(); node.id = id; nodes.set(id, node); } return nodes.get(id); },
    $$: () => [], month: () => '2026-10', cents: (v) => v, go() {}, api: async () => { throw new Error('API não esperada'); } };
  const ai = { Schema: S, GoogleAIBackend: class {}, getAI: () => ({}),
    getGenerativeModel(_, config) {
      models.push(config); order.push('model');
      return { startChat({ history }) {
        histories.push(history); const ownHistory = [...history];
        return { getHistory: async () => ownHistory, async sendMessageStream(content) {
          requests.push(content); ownHistory.push({ role: 'user', parts: [{ text: content }] });
          const text = user.id === 1 ? 'Dados privados da conta A' : 'Itens da conta B';
          const response = { text: () => text, functionCalls: () => [] };
          const reply = delayedReply && user.id === 1 ? new Promise((resolve) => { releaseReply = () => resolve(response); }) : Promise.resolve(response);
          return { stream: (async function* () {})(), response: reply };
        } };
      } };
    } };
  const window = { CC, addEventListener() {} };
  const context = { window, document, navigator: { userAgent: 'Mozilla' }, location: { protocol: 'http:', hostname: 'localhost', search: '' },
    MutationObserver: class { observe() {} }, URLSearchParams, setTimeout: () => 0,
    externalImport: async (url) => { imports.push(url); order.push('import'); return url.endsWith('firebase-app.js') ? { getApps: () => [{}] } : ai; } };
  if (desktop) CC.d = { papelSuite: () => user.suiteRole, tem: (p) => user.permissoes.includes(p), papelNome: () => 'Técnico',
    lerRota: () => ({ nome: 'obras' }), podeTela: () => true, ir() {} };
  for (const file of ['m/ia-config.js', 'm/ia-tools.js', 'm/ia-chat.js']) {
    // Só o import de SDK externo é substituído; conversa, autorização e renderização são reais.
    vm.runInNewContext(read(file).replaceAll('import(', 'externalImport('), context);
  }
  if (desktop) vm.runInNewContext(read('d/ia-desktop.js'), context);
  return { CC, models, histories, requests, imports, order, nodes,
    switchUser() { user = { id: 2, nome: 'Técnico', role: 'supervisor', suiteRole: 'tecnico', permissoes: ['p12'] }; token = 'b'; },
    release: () => releasePermissions(), releaseReply: () => releaseReply() };
}

for (const desktop of [false, true]) {
  test(`IA ${desktop ? 'desktop' : 'mobile'}: conversa e sugestões isolam a conta e o papel atual`, async () => {
    const { CC, models, histories, nodes, switchUser } = chatFixture({ desktop });
    await CC.ia.open('Resumo reservado da administração');
    switchUser();
    await CC.ia.open();
    const hello = nodes.get('ia-log').innerHTML;
    assert.doesNotMatch(hello, /Dados privados|custos|orçado|propostas|despesa|pagar/i);
    assert.match(hello, /checklist|fotos|observações/);
    await CC.ia.open('Quais os meus serviços?');
    assert.equal(models.length, 2);
    assert.equal(histories[1].length, 0, 'histórico anterior não chega ao modelo da nova conta');
    assert.doesNotMatch(models[1].systemInstruction, /listar_propostas|R\$/);
    assert.ok(!models[1].tools[0].functionDeclarations.some((d) => d.name === 'resumo_geral'));
    assert.doesNotMatch(nodes.get('ia-log').innerHTML, /Resumo reservado|Dados privados/);
  });
}

test('IA: abertura aguarda permissões antes de montar sugestões ou carregar SDK', async () => {
  const { CC, imports, models, nodes, switchUser, release } = chatFixture({ pending: true });
  switchUser();
  const opened = CC.ia.open('Meu checklist');
  await Promise.resolve();
  assert.equal(imports.length, 0);
  assert.equal(nodes.has('ia-sheet'), false);
  release();
  await opened;
  assert.equal(models.length, 1);
  assert.doesNotMatch(models[0].systemInstruction, /R\$/);
});

test('IA: aquecimento valida permissões antes de carregar o SDK', async () => {
  const { CC, imports, release, order } = chatFixture({ pending: true });
  const warming = CC.ia.warm();
  await Promise.resolve();
  assert.equal(imports.length, 0);
  release();
  await warming;
  assert.equal(order[0], 'permissions');
  assert.equal(imports.length, 2);
});

test('IA: resposta atrasada da conta anterior não aparece nem altera a conversa atual', async () => {
  const { CC, requests, nodes, switchUser, releaseReply } = chatFixture({ delayedReply: true });
  const first = CC.ia.open('Pergunta reservada da conta A');
  for (let i = 0; i < 30 && !requests.length; i += 1) await Promise.resolve();
  assert.equal(requests.length, 1);
  switchUser();
  await CC.ia.open('Meus serviços da conta B');
  releaseReply();
  await first;
  assert.match(nodes.get('ia-log').innerHTML, /Itens da conta B/);
  assert.doesNotMatch(nodes.get('ia-log').innerHTML, /Dados privados|Pergunta reservada/);
});
