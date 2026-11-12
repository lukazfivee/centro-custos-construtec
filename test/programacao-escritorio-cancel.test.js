const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  return { innerHTML: '', textContent: '', disabled: false, isConnected: true, listeners: {}, focus() {}, setAttribute() {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, emit(type) { return this.listeners[type]({ preventDefault() {} }); } };
}
test('cancelamento preserva motivo no conflito e só reenvia após nova confirmação', async () => {
  const a = { id: 19, dia: '2026-10-15', ordem: 2, orientacao: 'Conferir quadro', revision: 7,
    centro: { id: 12, nome: 'Loja', tipo: 'servico' }, participantes: [{ id: 3, nome: 'Ana', estado: 'pausado', ativo: true }], eventos: [] };
  const top = {};
  for (const name of ['day', 'refresh', 'new', 'editor', 'details']) top[`[data-pe-${name}]`] = element();
  const detail = {};
  for (const name of ['close-detail', 'edit', 'copy', 'cancel', 'cancel-slot']) detail[`[data-pe-${name}]`] = element();
  detail.h2 = element();
  top['[data-pe-details]'].querySelector = (key) => detail[key];
  const reason = { value: 'Chuva na obra', focus() {} };
  const message = element();
  const button = element();
  const form = { ...element(), elements: { motivo: reason }, reportValidity: () => true,
    querySelector: (key) => key === '[data-pe-confirm-cancel]' ? button : message };
  detail['[data-pe-cancel-slot]'].querySelector = () => form;
  const open = { ...element(), dataset: { peDetail: '19' } };
  const slot = { ...element(), querySelector: (key) => top[key], querySelectorAll: () => [open] };
  const sent = [];
  let latest = false;
  const CC = { esc: String, session: { token: () => 'token', user: () => ({ id: 1, permissoes: ['p5'] }) },
    api: async (url, config) => {
      if (config) {
        sent.push(JSON.parse(JSON.stringify(config.body)));
        if (config.body.revision === 7) { latest = true; throw Object.assign(new Error('Conflito'), { status: 409 }); }
        return { data: { ...a, cancelada: true } };
      }
      if (url === '/programacao/19') return { data: { ...a, revision: latest ? 9 : 7 } };
      return { data: { atividades: [a] } };
    } };
  const context = { window: { CC }, Date, Intl };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/m/programacao-escritorio.js'), 'utf8'), context);
  await CC.programacaoEscritorio.mount(slot, { dia: '2026-10-15' });
  await open.emit('click');
  detail['[data-pe-cancel]'].emit('click');
  await form.emit('submit');
  assert.equal(sent.length, 1, 'não confirma automaticamente depois de carregar revisão');
  assert.equal(reason.value, 'Chuva na obra');
  assert.ok(message.textContent.includes('Confirme novamente'));
  await form.emit('submit');
  assert.deepEqual(sent, [{ revision: 7, motivo: 'Chuva na obra' }, { revision: 9, motivo: 'Chuva na obra' }]);
});
