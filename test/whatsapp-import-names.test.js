const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCenterName } = require('../lib/whatsappImport/names');
test('normaliza comparação sem fundir centros diferentes', () => {
  assert.equal(normalizeCenterName(' Fóo ,  Bar ').chave, normalizeCenterName('FOO, BAR_OBRAX').chave);
  assert.notEqual(normalizeCenterName('FÓO BAR').chave, normalizeCenterName('FOO BAZ').chave);
  assert.equal(normalizeCenterName(' Manutenção  Interna ').nomeExibicao, 'MANUTENCAO INTERNA');
});
