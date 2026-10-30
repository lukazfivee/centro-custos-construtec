const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const window = { CC:{} };
vm.runInNewContext(fs.readFileSync(require.resolve('../public/d/ia-whatsapp.js'),'utf8'),{window,JSON,Error,String});
const W = window.CC.whatsappIA;
test('prompt inclui dados e regras de extração sem cálculo', () => {
  const prompt = W.prompt('R$ 10,00 - CABO',[{id:3,nome:'Material'}]);
  assert.match(prompt,/sem inventar ou calcular/); assert.match(prompt,/R\$ 10,00/); assert.match(prompt,/Material/);
});
test('rejeita resposta malformada e aceita JSON com itens', () => {
  assert.equal(W.parse('{"itens":[{"descricao":"CABO"}]}').length,1);
  assert.throws(() => W.parse('{"itens":{}}'));
  assert.throws(() => W.parse('não é JSON'));
});
