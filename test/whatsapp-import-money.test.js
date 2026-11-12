const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseBrl, findAmountsInText } = require('../lib/whatsappImport/money');
test('interpreta valores brasileiros em centavos sem aceitar lixo', () => {
  for (const [input, cents] of [['R$ 279,20', 27920], ['1.203,92', 120392], ['R$2.221,50', 222150], [' 10 , 05 ', 1005]]) assert.equal(parseBrl(input), cents);
  for (const input of ['abc', '1.23,45', 'R$ 10,00 lixo', '999999999999999999999,00', '-1,00']) assert.equal(parseBrl(input), null);
});
test('encontra valores monetários no texto', () => {
  assert.deepEqual(findAmountsInText('Total R$ 300,00 e R$ 100,00'), [30000, 10000]);
  assert.deepEqual(findAmountsInText('sem valor'), []);
});
