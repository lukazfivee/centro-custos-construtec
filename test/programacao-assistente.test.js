const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/m/ia-tools.js'), 'utf8');
const Schema = new Proxy({}, { get: (_, kind) => (spec) => ({ kind, ...spec }) });
function fixture(role = 'tecnico') {
  const calls = [], went = [];
  const user = { id: 7, role: 'supervisor', suiteRole: role };
  const CC = {
    session: { user: () => user, token: () => 'session7' }, today: () => '2026-10-15', month: () => '2026-10', cents: Number,
    sv: { role: () => role, can: (p) => ['admin', 'gestor'].includes(role) && p === 'p5', loadPerms: async () => {} }, go: (...args) => went.push(args),
    api: async (url) => { calls.push(url); return { data: { dia: '2026-10-15', atividades: [
      { id: 3, dia: '2026-10-15', ordem: 1, orientacao: 'Ligar as câmeras restantes', revision: 9, cancelada: false,
        centro: { id: 11, nome: 'CEMED Ondina', tipo: 'servico', orcamento: 9999 }, gasto: 500,
        participantes: [{ id: 7, nome: 'Deco', estado: 'em_andamento', ativo: true, salario: 5000 }, { id: 8, nome: 'André', estado: 'pausado', ativo: true }],
        eventos: [{ observacao: 'campo que não foi solicitado' }] },
    ] } }; },
  };
  vm.runInNewContext(source, { window: { CC }, navigator: { userAgent: 'Mozilla' }, location: { search: '' }, URLSearchParams });
  return { CC, calls, went };
}
const run = (CC, name, args = {}) => CC.ia.run({ name, args });
test('IA consulta programação do dia com estados individuais e somente campos operacionais', async () => {
  const { CC, calls } = fixture();
  assert.ok(CC.ia.declarations(Schema)[0].functionDeclarations.some((d) => d.name === 'ver_programacao'));
  const result = await run(CC, 'ver_programacao');
  assert.deepEqual(calls, ['/programacao?dia=2026-10-15']);
  assert.equal(result.atividades[0].centro.nome, 'CEMED Ondina');
  assert.equal(result.atividades[0].participantes[1].estado, 'pausado');
  assert.doesNotMatch(JSON.stringify(result), /orcamento|gasto|salario|revision|eventos/);
});
test('IA não chama API em data inválida nem para perfil sem programação', async () => {
  const tech = fixture();
  for (const dia of ['2026-02-31', '2026-13-01', '../usuarios', '15/10/2026']) assert.ok((await run(tech.CC, 'ver_programacao', { dia })).erro);
  assert.deepEqual(tech.calls, []);
  const financeiro = fixture('financeiro');
  assert.ok((await run(financeiro.CC, 'ver_programacao')).erro);
  assert.ok((await run(financeiro.CC, 'abrir_tela', { tela: 'programacao' })).erro);
  assert.deepEqual(financeiro.calls, []);
  assert.ok(!financeiro.CC.ia.declarations(Schema)[0].functionDeclarations.some((d) => d.name === 'ver_programacao'));
});
test('IA abre Meu dia para técnico e Programação para gestor', async () => {
  for (const [role, screen] of [['tecnico', 'meu-dia'], ['gestor', 'programacao']]) {
    const { CC, went } = fixture(role);
    assert.equal((await run(CC, 'abrir_tela', { tela: 'programacao' })).ok, true);
    CC.ia.pendingNav();
    assert.deepEqual(went, [[screen]]);
  }
});
