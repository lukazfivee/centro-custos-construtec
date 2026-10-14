const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function historico() {
  const CC = { d: {}, money: String };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/d/telas/historico-dados.js'), 'utf8'), { window: { CC }, URLSearchParams });
  return CC.d.hist;
}

test('Histórico apresenta em português as ações gravadas por Reports e importação', () => {
  const H = historico();
  for (const [acao, rotulo] of [['create', 'Criou'], ['update', 'Editou'], ['delete', 'Excluiu'], ['confirmed', 'Confirmou']]) {
    assert.equal(H.acao(acao).rotulo, rotulo);
  }
  assert.equal(H.tipoNome('bug_report'), 'report');
  assert.equal(H.acao('criado').rotulo, 'Criou');
  assert.equal(H.acao('acao_futura').rotulo, 'Acao futura', 'ação desconhecida continua visível');
});

test('Histórico de fechamento mostra pendências legíveis, preservando a comparação', () => {
  const H = historico();
  const item = { antes: { pendencias: [] }, data: { pendencias: [
    { chave: 'vencidas', titulo: '1 conta a pagar vencida', quantidade: 1, valor: 100 },
    { chave: 'recorrentes', titulo: '3 recorrentes do mês não gerados', quantidade: 3 },
  ] } };
  const mudanca = H.mudancas(item)[0];
  assert.equal(mudanca.campo, 'Pendências registradas');
  assert.equal(mudanca.antes, 'Nenhuma');
  assert.match(mudanca.depois, /1 conta a pagar vencida/);
  assert.match(mudanca.depois, /3 recorrentes do mês não gerados/);
  assert.doesNotMatch(mudanca.depois, /quantidade|chave|\{"/);
});

test('Histórico preserva uma mudança apenas na explicação da pendência', () => {
  const H = historico();
  const pendencia = { chave: 'vencidas', titulo: '1 conta vencida', quantidade: 1, valor: 100 };
  const mudancas = H.mudancas({ antes: { pendencias: [{ ...pendencia, detalhe: 'Vencimento anterior' }] }, data: { pendencias: [{ ...pendencia, detalhe: 'Vencimento ajustado' }] } });
  assert.equal(mudancas.length, 1);
  assert.match(mudancas[0].antes, /Vencimento anterior/);
  assert.match(mudancas[0].depois, /Vencimento ajustado/);
});
