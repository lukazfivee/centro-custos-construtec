const { test } = require('node:test');
const assert = require('node:assert/strict');
const { unparsedAmountLines } = require('../lib/whatsappImport/source');
test('aponta valores que não se encaixam nos formatos suportados', () => {
  assert.deepEqual(unparsedAmountLines('PAGAMENTO X\nR$ 300,00'), [2]);
  assert.deepEqual(unparsedAmountLines('PAGAMENTO X\nR$ 300,00\nA - CABO - R$ 300,00'), []);
  assert.deepEqual(unparsedAmountLines('R$ 25,00 sem separador'), [1]);
});
