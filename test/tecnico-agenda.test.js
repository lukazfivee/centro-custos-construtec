const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const CC = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/m/screen-home-tecnico.js'), 'utf8'), { window: { CC } });
const lista = [
  { id: 1, nome: 'Inspeção elétrica', cliente: 'Condomínio Sol', data: '2026-10-14', situacao: 'agendado' },
  { id: 2, nome: 'Central', local: 'São José', data: '2026-10-15', situacao: 'em_andamento' },
  { id: 3, nome: 'Câmeras', data: '2026-10-16', situacao: 'agendado' },
  { id: 4, nome: 'Finalizado', data: '2026-10-14', situacao: 'concluido' },
  { id: 5, nome: 'Faturado', data: '2026-10-15', situacao: 'faturado' },
  { id: 6, nome: 'Inativo', data: '2026-10-15', situacao: 'agendado', ativo: false },
  { id: 7, nome: 'Sem data', data: null, situacao: 'agendado' },
];
const ids = (filtro, busca = '') => Array.from(CC.tecnicoAgenda(lista, filtro, busca, '2026-10-15'), (s) => s.id);

test('agenda prioriza execucao, depois agendamentos antigos, e separa concluidos e inativos', () => {
  assert.deepEqual(ids('ativos'), [2, 1, 3, 7]);
  assert.deepEqual(ids('hoje'), [2]);
  assert.deepEqual(ids('atrasados'), [1]);
  assert.deepEqual(ids('em_andamento'), [2]);
  assert.deepEqual(ids('concluido'), [4]);
  assert.equal(lista[0].id, 1, 'ordenacao nao altera a lista original');
});

test('busca aceita acentos e pesquisa cliente e local dentro do filtro', () => {
  assert.deepEqual(ids('ativos', 'inspecao'), [1]);
  assert.deepEqual(ids('ativos', 'CONDOMINIO'), [1]);
  assert.deepEqual(ids('ativos', 'sao jose'), [2]);
  assert.deepEqual(ids('hoje', 'inspecao'), []);
});
