const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('rascunho so aparece salvo depois da confirmacao da ultima edicao', async () => {
  const elementos = {}, gravacoes = [];
  const elemento = (id) => elementos[id] ||= { value: '', textContent: '', eventos: {}, addEventListener(nome, fn) { this.eventos[nome] = fn; } };
  const CC = {
    sv: {}, esc: (s) => s, icon: () => '', owner: () => 'tecnico-1',
    store: { get: async () => null, put: (store, draft) => new Promise((resolve, reject) => gravacoes.push({ draft, resolve, reject })) },
    sheetHead: () => '', sheet: () => ({ el: {} }), $: (id) => elemento(id),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/m/screen-servico-registros.js'), 'utf8'), { window: { CC } });
  await CC.sv.relato({ id: 7, descricao: 'Original' });
  const texto = elemento('#sr-texto'), status = elemento('#sr-status');
  texto.value = 'Primeira edicao'; texto.eventos.input();
  texto.value = 'Edicao completa'; texto.eventos.input();
  assert.equal(status.textContent, 'Salvando rascunho…');
  gravacoes[0].resolve(); await Promise.resolve();
  assert.equal(status.textContent, 'Salvando rascunho…', 'a confirmacao antiga nao anuncia a edicao atual como salva');
  gravacoes[1].resolve(); await Promise.resolve();
  assert.equal(status.textContent, 'Rascunho salvo neste celular.');
  assert.equal(gravacoes[1].draft.texto, 'Edicao completa');
  assert.equal(gravacoes[1].draft.key, 'tecnico-1|relato-7');
  texto.value = 'Nova edicao'; texto.eventos.input();
  gravacoes[2].reject(new Error('Sem espaco')); await Promise.resolve();
  assert.match(status.textContent, /Não foi possível guardar/);
  assert.equal(texto.value, 'Nova edicao', 'erro de armazenamento preserva o texto no editor');
});
