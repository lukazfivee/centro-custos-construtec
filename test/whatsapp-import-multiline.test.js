const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkItems } = require('../lib/whatsappImport/check');
test('centro com continuação na linha seguinte é identificado sem alterar o valor', () => {
  const text = 'PAGAMENTO FORNECEDOR A\nR$ 123,45 - MATERIAL X\nCENTRO DE CUSTO: REPOSIÇÃO INTERNA - DISTRIBUIR NOS CENTROS\nDE CUSTO DA EMPRESA\n\nR$ 100,00 - MATERIAL Y\nCENTRO DE CUSTO: OBRA A';
  const item = {bloco:1,linha:1,valor_texto:'R$ 123,45',descricao:'MATERIAL X',centro:'REPOSIÇÃO INTERNA - DISTRIBUIR NOS CENTROS DE CUSTO DA EMPRESA',fornecedor:'FORNECEDOR A'};
  const result = checkItems(text,[item]);
  assert.equal(result[0].ok,true); assert.equal(result[0].centavos,12345);
});
test('continuação não absorve outra compra ou cabeçalho', () => {
  const text='PAGAMENTO A\nR$ 100,00 - CABO\nCENTRO DE CUSTO: OBRA A\nR$ 200,00 - TUBO\nCENTRO DE CUSTO: OBRA B';
  const items=[['100,00','CABO','OBRA A'],['200,00','TUBO','OBRA B']].map(([valor_texto,descricao,centro],linha)=>({bloco:1,linha,valor_texto,descricao,centro}));
  assert.ok(checkItems(text,items).every(x=>x.ok));
});
test('um item sem centro ainda aponta a linha de origem sem ser lançado', () => {
  const text='PAGAMENTO FORNECEDOR A\nR$ 75,00 - MATERIAL TESTE';
  const result=checkItems(text,[{linha:1,valor_texto:'R$ 75,00',descricao:'MATERIAL TESTE',centro:''}]);
  assert.equal(result[0].ok,false); assert.equal(result[0].sourceIndex,1);
});
