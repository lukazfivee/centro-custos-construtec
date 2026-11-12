const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkItems } = require('../lib/whatsappImport/check');
const texto = 'R$ 300,00\nDestino A - CABO - R$ 100,00\nDestino B - TUBO - R$ 150,00\nDestino C - PECA - R$ 50,00';
const items = [ ['100,00', 'Destino A', 'CABO'], ['150,00', 'Destino B', 'TUBO'], ['50,00', 'Destino C', 'PECA'] ].map(([valor_texto, centro, descricao], linha) => ({ bloco: 1, linha, valor_texto, centro, descricao, total_bloco_texto: 'R$ 300,00' }));
test('aceita bloco quando a soma confere', () => assert.ok(checkItems(texto, items).every(x => x.ok)));
test('rejeita bloco inteiro quando a soma difere', () => assert.ok(checkItems(texto, items.slice(0, 2)).every(x => !x.ok)));
test('recusa associação de valor e centro que não existe', () => {
  assert.equal(checkItems(texto, [{ ...items[0], centro:'Destino B', total_bloco_texto:undefined }])[0].ok, false);
});
test('recusa valor ausente e centro vazio', () => {
  assert.equal(checkItems(texto, [{ bloco: 2, linha: 1, valor_texto: '10,00', centro: 'A' }])[0].ok, false);
  assert.equal(checkItems(texto, [{ bloco: 2, linha: 1, valor_texto: '100,00', centro: '' }])[0].ok, false);
});
