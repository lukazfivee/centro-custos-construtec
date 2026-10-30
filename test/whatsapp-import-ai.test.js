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
test('aceita lista de itens diretamente e recusa entradas inválidas', () => {
  assert.equal(W.parse('[{"descricao":"CABO"}]').length,1);
  assert.throws(() => W.parse('[null]'));
});
test('usa esquema e tenta modelo reserva após resposta inválida', async () => {
  const calls=[];
  const Schema = {string:()=>({type:'string'}),integer:()=>({type:'integer'}),array:o=>({type:'array',...o}),object:o=>({type:'object',...o})};
  window.CC.iaConfig={modelos:[{nome:'primeiro',pensar:'MINIMAL'},{nome:'reserva',pensar:'LOW'}]};
  window.CC.ia={prepare:async()=>true,contextKey:()=> 'sessao',backend:async()=>({ai:{Schema,getGenerativeModel:(_,options)=>({generateContent:async()=>{calls.push(options);return {response:{text:()=>calls.length===1?'{"erro":"formato"}':'{"itens":[{"descricao":"CABO"}]}',candidates:[{finishReason:'STOP'}]}};}})},backend:{}})};
  const result=await W.extrair('R$ 10,00 - CABO',[]);
  assert.equal(result.length,1); assert.equal(calls.length,2); assert.ok(calls[0].generationConfig.responseSchema);
});
test('não retorna resposta parcial quando os dois modelos falham', async () => {
  const Schema = {string:()=>({}),integer:()=>({}),array:o=>o,object:o=>o};
  let calls=0;
  window.CC.ia={prepare:async()=>true,contextKey:()=> 'sessao',backend:async()=>({ai:{Schema,getGenerativeModel:()=>({generateContent:async()=>{calls++; return {response:{text:()=>'{"erro":true}',candidates:[{finishReason:'STOP'}]}};}})},backend:{}})};
  await assert.rejects(W.extrair('texto fictício',[]),/Nenhum lançamento foi feito/);
  assert.equal(calls,2);
});
test('interrompe a extração se a sessão mudar', async () => {
  const Schema = {string:()=>({}),integer:()=>({}),array:o=>o,object:o=>o}; let owner='primeira'; let calls=0;
  window.CC.ia={prepare:async()=>true,contextKey:()=>owner,backend:async()=>({ai:{Schema,getGenerativeModel:()=>({generateContent:async()=>{calls++; owner='outra'; return {response:{text:()=>'{"itens":[]}'}};}})},backend:{}})};
  await assert.rejects(W.extrair('texto fictício',[]),/sessão mudou/); assert.equal(calls,1);
});
