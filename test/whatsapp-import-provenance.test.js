const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkItems } = require('../lib/whatsappImport/check');
test('não permite trocar sufixo de obra nem inventar fornecedor', () => {
  const text='PAGAMENTO FORNECEDOR A\nR$ 100,00 - CABO\nCENTRO DE CUSTO: SALA_OBRA1';
  const row={valor_texto:'R$ 100,00',descricao:'CABO',centro:'SALA_OBRA1',fornecedor:'FORNECEDOR A'};
  assert.equal(checkItems(text,[row])[0].ok,true);
  assert.equal(checkItems(text,[{...row,centro:'SALA_OBRA2'}])[0].ok,false);
  assert.equal(checkItems(text,[{...row,fornecedor:'FORNECEDOR B'}])[0].ok,false);
});
