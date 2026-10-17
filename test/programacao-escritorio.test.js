const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(user = { id: 1, role: 'gestor', permissoes: ['p5'] }) {
  let token = 'conta-1';
  const CC = { esc: (x) => String(x ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])),
    session: { user: () => user, token: () => token }, screens: {} };
  const context = { window: { CC }, Intl, Date, URLSearchParams };
  for (const file of ['programacao-escritorio-form.js', 'programacao-escritorio.js']) {
    const target = path.join(__dirname, '../public/m', file);
    if (fs.existsSync(target)) vm.runInNewContext(fs.readFileSync(target, 'utf8'), context);
  }
  return { CC, P: CC.programacaoEscritorio, changeSession: () => { token = 'conta-2'; } };
}
const activity = { id: 19, revision: 7, dia: '2026-10-15', ordem: 2, orientacao: 'Revisar quadro',
  centro: { id: 12, nome: 'Loja <Sul>', tipo: 'servico', codigo: 'SV-12', cliente: 'CEMED <Ondina>' },
  participantes: [{ id: 3, nome: 'Ana', ativo: true, estado: 'pausado' }, { id: 4, nome: 'Beto', ativo: false, estado: 'concluido' }] };
const values = { dia: '2026-10-16', centroId: '99', orientacao: ' Verificar circuito ', ordem: '3', tecnicos: ['3', '5'] };
const plain = (x) => JSON.parse(JSON.stringify(x));

test('criação usa destino e equipe explícitos; edição envia revisão sem trocar o destino', () => {
  const { P } = load();
  assert.ok(P, 'componente de programação disponível');
  assert.deepEqual(plain(P.payload(values)), { dia: '2026-10-16', centroId: 99, orientacao: 'Verificar circuito', ordem: 3, tecnicos: [3, 5] });
  assert.deepEqual(plain(P.payload(values, activity)), { dia: '2026-10-16', orientacao: 'Verificar circuito', ordem: 3, tecnicos: [3, 5], revision: 7 });
});

test('cópia mantém origem e destino, sem copiar revisão ou andamentos', () => {
  const { P } = load();
  assert.ok(P, 'componente de programação disponível');
  assert.deepEqual(plain(P.payload(values, activity, true)), { dia: '2026-10-16', centroId: 12, orientacao: 'Verificar circuito', ordem: 3, tecnicos: [3, 5], origemId: 19 });
});

test('equipe obrigatória e ordem inteira são validadas antes de salvar', () => {
  const { P } = load();
  assert.ok(P, 'componente de programação disponível');
  assert.throws(() => P.payload({ ...values, tecnicos: [] }), /técnico/);
  assert.throws(() => P.payload({ ...values, ordem: '1.5' }), /ordem/i);
  assert.throws(() => P.payload({ ...values, orientacao: '  ' }), /orientação/i);
});

test('atalho seleciona nomes concretos sem programação e mantém a seleção atual', () => {
  const { P } = load();
  assert.ok(P, 'componente de programação disponível');
  assert.deepEqual(plain(P.semProgramacao([{ id: 3, programado: true }, { id: 5, programado: false }, { id: 6, programado: false }], ['3', '5'])), ['3', '5', '6']);
});

test('cartão mostra tipo independente, progresso somente da equipe ativa e escapa nomes', () => {
  const { P } = load();
  assert.ok(P, 'componente de programação disponível');
  const html = P.card(activity);
  assert.ok(html.includes('Serviço'));
  assert.ok(html.includes('Loja &lt;Sul&gt;'));
  assert.ok(html.includes('CEMED &lt;Ondina&gt;'));
  assert.ok(html.includes('Ana') && html.includes('Pausado'));
  assert.ok(html.includes('0 de 1'));
  assert.ok(!html.includes('Beto'));
});

test('histórico apresenta autor, eventos administrativos e observações preservadas', () => {
  const { P } = load();
  assert.ok(P, 'componente de programação disponível');
  const html = P.history([{ id: 1, nome: 'Ana', estado: 'pausado', tipo: 'andamento', observacao: 'Falta <teste>', criadoEm: '2026-10-15T15:00:00Z' },
    { id: 2, nome: 'Gestor', estado: null, tipo: 'instrucao', observacao: 'Instrução anterior', criadoEm: '2026-10-15T16:00:00Z' }]);
  for (const text of ['Ana', 'Pausado', 'Falta &lt;teste&gt;', 'Gestor', 'Instrução anterior', '12:00']) assert.ok(html.includes(text), text);
});

test('sem p5 não faz requisições; sessão trocada descarta respostas atrasadas', async () => {
  const forbidden = load({ id: 2, role: 'tecnico', permissoes: ['p2'] });
  assert.ok(forbidden.P, 'componente de programação disponível');
  let requests = 0;
  forbidden.CC.api = async () => { requests++; return { data: {} }; };
  const slot = { innerHTML: '', isConnected: true };
  await forbidden.P.mount(slot);
  assert.equal(requests, 0);
  assert.ok(slot.innerHTML.includes('Sem permissão'));

  const session = load();
  let finish;
  session.CC.api = () => new Promise((resolve) => { finish = resolve; });
  const pending = session.P.mount(slot);
  session.changeSession();
  finish({ data: { atividades: [activity] } });
  await pending;
  assert.ok(!slot.innerHTML.includes('Loja'));
});
