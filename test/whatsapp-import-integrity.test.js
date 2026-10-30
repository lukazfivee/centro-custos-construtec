const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkItems } = require('../lib/whatsappImport/check');
const text = 'PAGAMENTO A\nR$ 300,00\nDestino A - CABO - R$ 100,00\nDestino B - TUBO - R$ 150,00\nDestino C - PECA - R$ 50,00';
const item = {bloco:1, linha:1, centro:'Destino A', descricao:'CABO', valor_texto:'R$ 100,00'};
test('não aceita omissão do total ou de parcelas do bloco', () => {
  assert.equal(checkItems(text, [item])[0].ok, false);
  assert.equal(checkItems(text, [{...item,total_bloco_texto:'R$ 300,00'}])[0].ok, false);
});
test('não aceita repetir a mesma linha extraída', () => {
  const input = 'R$ 100,00 - CABO\nCENTRO DE CUSTO: OBRA A';
  const row = {bloco:1, linha:1, centro:'OBRA A', descricao:'CABO', valor_texto:'R$ 100,00'};
  assert.ok(checkItems(input,[row,{...row,linha:2}]).every(x => !x.ok));
});
