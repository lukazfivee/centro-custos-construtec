const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifySource } = require('../lib/whatsappImport/source');
const texto = 'R$ 100,00 - MATERIAL A\nCENTRO DE CUSTO: OBRA A\nR$ 250,00 - MATERIAL B\nCENTRO DE CUSTO: OBRA B\nDestino C – CABO – R$ 50,00';
test('associa descrição, centro e valor ao mesmo trecho', () => {
  assert.equal(verifySource(texto, {valor_texto:'R$ 100,00', descricao:'MATERIAL A', centro:'OBRA A'}), true);
  assert.equal(verifySource(texto, {valor_texto:'R$ 100,00', descricao:'MATERIAL A', centro:'OBRA B'}), false);
  assert.equal(verifySource(texto, {valor_texto:'R$ 50,00', descricao:'CABO', centro:'Destino C'}), true);
  assert.equal(verifySource(texto, {valor_texto:'R$ 50,00', descricao:'MATERIAL A', centro:'Destino C'}), false);
});
test('recusa trechos ambíguos e descrições vazias', () => {
  assert.equal(verifySource(texto + '\nR$ 100,00 - MATERIAL A\nCENTRO DE CUSTO: OBRA A', {valor_texto:'R$ 100,00', descricao:'MATERIAL A', centro:'OBRA A'}), false);
  assert.equal(verifySource(texto, {valor_texto:'R$ 100,00', descricao:'', centro:'OBRA A'}), false);
});
