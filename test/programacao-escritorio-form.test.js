const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Porta de DOM mínima: testa os controladores e a API; os E2Es cobrem o HTML no navegador.
function node(value = '') {
  return { value, innerHTML: '', textContent: '', isConnected: true, disabled: false, hidden: false, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {},
    emit(type) { return this.listeners[type]({ preventDefault() {} }); } };
}
function setup(api, atividade) {
  const elements = { dia: node('2026-10-15'), centroId: node('12'), orientacao: node('Trocar circuito'), ordem: node('2') };
  const selectors = {};
  for (const key of ['save', 'unscheduled', 'form-message', 'options-retry', 'close', 'technicians', 'conflict', 'revision', 'current']) selectors[`[data-pe-${key}]`] = node();
  const form = { ...node(), elements, reportValidity: () => true,
    querySelector: (s) => selectors[s], querySelectorAll: () => [{ value: '3', checked: true }] };
  selectors['[data-pe-conflict]'].querySelector = (s) => selectors[s];
  const slot = { ...node(), querySelector: () => form };
  const CC = { session: { token: () => 'token', user: () => ({ id: 1, permissoes: ['p5'] }) }, esc: String, api };
  const context = { window: { CC }, Date, Intl };
  for (const file of ['programacao-escritorio-form.js', 'programacao-escritorio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/m', file), 'utf8'), context);
  let live = true;
  const saved = [];
  return { CC, form, fields: elements, selectors, saved, stop: () => { live = false; },
    mount: () => CC.programacaoEscritorio.form(slot, { atividade, dia: '2026-10-15', live: () => live,
      saved: async (data) => { saved.push(data); }, close() {} }) };
}
const options = { data: { centros: [{ id: 12, nome: 'Loja', tipo: 'servico' }], tecnicos: [{ id: 3, nome: 'Ana', programado: false }] } };
const atividade = { id: 19, revision: 7, dia: '2026-10-15', ordem: 2, orientacao: 'Original', centro: { id: 12, nome: 'Loja', tipo: 'servico' },
  participantes: [{ id: 3, nome: 'Ana', estado: 'pendente', ativo: true }] };

test('400 preserva orientação e permite corrigir e reenviar a criação', async () => {
  const sent = [];
  let reject = true;
  const ctx = setup(async (url, config) => {
    if (!config) return options;
    sent.push({ url, ...JSON.parse(JSON.stringify(config)) });
    if (reject) throw Object.assign(new Error('Orientação inválida'), { status: 400 });
    return { data: { id: 42, dia: '2026-10-15' } };
  });
  await ctx.mount();
  await ctx.form.emit('submit');
  assert.equal(ctx.saved.length, 0);
  assert.equal(ctx.fields.orientacao.value, 'Trocar circuito');
  assert.equal(ctx.selectors['[data-pe-save]'].disabled, false);
  assert.equal(ctx.selectors['[data-pe-form-message]'].textContent, 'Orientação inválida');
  reject = false;
  ctx.fields.orientacao.value = 'Orientação corrigida';
  await ctx.form.emit('submit');
  assert.deepEqual(sent[1], { url: '/programacao', method: 'POST', body: { dia: '2026-10-15', orientacao: 'Orientação corrigida', ordem: 2, tecnicos: [3], centroId: 12 } });
  assert.equal(ctx.saved[0].id, 42);
});

test('409 exige carregar revisão atual e mantém o texto local na edição', async () => {
  const sent = [];
  const ctx = setup(async (url, config) => {
    if (url.includes('/opcoes')) return options;
    if (!config) return { data: { ...atividade, revision: 9, orientacao: 'Alterada por outro gestor' } };
    sent.push(JSON.parse(JSON.stringify(config)));
    if (config.body.revision === 7) throw Object.assign(new Error('Conflito'), { status: 409 });
    return { data: { ...atividade, revision: 10 } };
  }, atividade);
  await ctx.mount();
  await ctx.form.emit('submit');
  assert.equal(ctx.saved.length, 0);
  assert.equal(ctx.fields.orientacao.value, 'Trocar circuito');
  await ctx.selectors['[data-pe-revision]'].emit('click');
  assert.ok(ctx.selectors['[data-pe-current]'].innerHTML.includes('Alterada por outro gestor'));
  assert.equal(ctx.fields.orientacao.value, 'Trocar circuito');
  await ctx.form.emit('submit');
  assert.deepEqual(sent[1], { method: 'PUT', body: { dia: '2026-10-15', orientacao: 'Trocar circuito', ordem: 2, tecnicos: [3], revision: 9 } });
  assert.equal(ctx.saved.length, 1);
});

test('troca de tela durante envio não entrega resposta à nova tela', async () => {
  let finish;
  const ctx = setup(async (url, config) => {
    if (!config) return options;
    return new Promise((resolve) => { finish = resolve; });
  });
  await ctx.mount();
  const pending = ctx.form.emit('submit');
  ctx.stop();
  finish({ data: { id: 42 } });
  await pending;
  assert.equal(ctx.saved.length, 0);
});
