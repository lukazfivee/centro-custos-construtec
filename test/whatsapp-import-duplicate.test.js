const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkItems } = require('../lib/whatsappImport/check');
const linha = (valor_texto, descricao, centro) => ({ bloco:1, linha:1, fornecedor:'FORNECEDOR A', valor_texto, descricao, centro });
const heading = '*1 - PAGAMENTO FORNECEDOR A*\n';
const compra = 'R$ 250,50 - FECHADURA\nCENTRO DE CUSTO: MANUTENCAO NAS PORTAS - OBRA X\n';

test('aceita duas linhas idênticas quando a extração traz as duas', () => {
  const result = checkItems(`${heading}${compra}\n${compra}`, [linha('R$ 250,50', 'FECHADURA', 'MANUTENCAO NAS PORTAS - OBRA X'), linha('R$ 250,50', 'FECHADURA', 'MANUTENCAO NAS PORTAS - OBRA X')]);
  assert.ok(result.every(x => x.ok), JSON.stringify(result.map(x => x.motivo)));
  assert.notEqual(result[0].sourceIndex, result[1].sourceIndex);
});
test('recusa quando a extração traz menos linhas idênticas que a mensagem', () => {
  const result = checkItems(`${heading}${compra}\n${compra}`, [linha('R$ 250,50', 'FECHADURA', 'MANUTENCAO NAS PORTAS - OBRA X')]);
  assert.equal(result[0].ok, false);
});
test('recusa quando a extração traz mais linhas idênticas que a mensagem', () => {
  const result = checkItems(`${heading}${compra}`, [linha('R$ 250,50', 'FECHADURA', 'MANUTENCAO NAS PORTAS - OBRA X'), linha('R$ 250,50', 'FECHADURA', 'MANUTENCAO NAS PORTAS - OBRA X')]);
  assert.ok(result.every(x => !x.ok));
});
