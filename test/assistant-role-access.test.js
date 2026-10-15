const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const S = new Proxy({}, { get: (_, kind) => (spec) => ({ kind, ...spec }) });
function fixture({ role = 'tecnico', permissions = ['p2', 'p12'], desktop = false, loadRole } = {}) {
  let user = { id: 18, nome: 'Técnico', role: 'supervisor', suiteRole: role, permissoes: permissions };
  let token = 'session-18', loaded = !loadRole;
  const calls = [], went = [];
  const CC = {
    session: { user: () => user, token: () => token }, owner: () => `${token}:${user.id}`, cents: (v) => v,
    month: () => '2026-10', go: (...args) => went.push(args), suite: { orcLink: () => '/orcamentos' },
    sv: { role: () => loaded ? user.suiteRole || 'tecnico' : 'admin', can: (p) => loaded && user.permissoes.includes(p),
      loadPerms: async () => { loaded = true; if (loadRole) user.suiteRole = loadRole; } },
    api: async (url) => {
      calls.push(url);
      if (url.startsWith('/centros-custo?')) return { data: [
        { id: 7, tipo: 'obra', nome: 'Obra atribuída', orcamento: 1000, total_comprometido: 500 },
        { id: 9, tipo: 'servico', nome: 'Serviço independente', valor: 999 },
      ] };
      if (url.includes('/detalhes?')) return { data: { centro: { id: 7, nome: 'Obra atribuída', local: 'Rua A', descricao: 'Inspeção', orcamento: 1000 }, lancamentos: [{ valor: 111 }] } };
      const service = { id: 9, codigo: 'SV-9', nome: 'Serviço independente', local: 'Rua B', descricao: 'Relato', gastos: [{ valor: 300 }],
        valor: 999, resumo: { gastos: 300 }, faturamento: { valor: 999 },
        checklist: [{ id: 'c1', texto: 'Conferir quadro', feito: false, valor: 100 }],
        fotos: [{ id: 1, fase: 'antes', legenda: 'Quadro', valor: 123 }], execucao: { itens: 1, feitos: 0, gastos: 99 } };
      if (url.startsWith('/servicos?')) return { data: [service] };
      if (url === '/servicos/9') return { data: service };
      throw new Error(`API inesperada: ${url}`);
    },
  };
  if (desktop) CC.d = { papelSuite: () => user.suiteRole, tem: (p) => user.permissoes.includes(p),
    papelNome: () => 'Técnico', lerRota: () => ({ nome: 'obras' }), podeTela: () => true, ir: (url) => went.push(url) };
  const context = { window: { CC }, location: { href: '', search: '' }, navigator: { userAgent: 'Mozilla' }, URLSearchParams, console };
  vm.runInNewContext(read('m/ia-config.js'), context);
  vm.runInNewContext(read('m/ia-tools.js'), context);
  if (desktop) vm.runInNewContext(read('d/ia-desktop.js'), context);
  return { CC, calls, went, setUser: (next) => { user = next; token = `session-${next.id}`; } };
}
const declarations = (CC) => CC.ia.declarations(S)[0].functionDeclarations;
const run = (CC, name, args = {}) => CC.ia.run({ name, args });

for (const desktop of [false, true]) {
  test(`IA ${desktop ? 'desktop' : 'mobile'}: técnico não recebe ferramentas financeiras e chamadas diretas não consultam API`, async () => {
    const { CC, calls } = fixture({ desktop, permissions: ['p1', 'p2', 'p5', 'p11', 'p12'] });
    const names = declarations(CC).map((d) => d.name);
    assert.deepEqual([...names].sort(), ['abrir_tela', 'listar_obras', 'listar_servicos', 'preparar_reporte', 'ver_obra', 'ver_servico'].sort());
    for (const name of ['resumo_geral', 'buscar_lancamentos', 'listar_categorias', 'orcado_realizado', 'listar_propostas', 'ver_proposta']) {
      assert.ok((await run(CC, name)).erro, name);
    }
    for (const tela of ['nova_despesa', 'lancamentos', 'orcamentos', 'proposta', 'versao_completa', 'fornecedores']) {
      assert.ok((await run(CC, 'abrir_tela', { tela })).erro, tela);
      assert.equal(CC.ia.pendingNav, undefined);
    }
    assert.equal(calls.length, 0);
    assert.doesNotMatch(CC.iaPrompt(), /R\$|Nova despesa|listar_propostas|orçado x realizado/i);
    assert.match(CC.iaPrompt(), /checklist|fotos/);
  });
}

test('IA: projeção de obras e serviços mantém execução e elimina finanças até em respostas antigas do servidor', async () => {
  const { CC } = fixture();
  const obras = await run(CC, 'listar_obras');
  assert.equal(obras.total, 1);
  assert.equal(obras.obras[0].nome, 'Obra atribuída');
  const obra = await run(CC, 'ver_obra', { obra_id: 7 });
  assert.equal(obra.local, 'Rua A');
  const list = await run(CC, 'listar_servicos');
  assert.equal(list.servicos[0].nome, 'Serviço independente');
  const service = await run(CC, 'ver_servico', { servico_id: 9 });
  assert.equal(service.checklist[0].texto, 'Conferir quadro');
  assert.equal(service.fotos[0].legenda, 'Quadro');
  assert.doesNotMatch(JSON.stringify([obras, obra, list, service]), /orcamento|orcado|comprometido|resultado|valor|gastos|faturamento|lancamento|recebido|pago/);
});

test('IA: permissão carregada antes da ferramenta impede usar papel antigo de admin', async () => {
  const { CC, calls } = fixture({ loadRole: 'tecnico' });
  assert.ok((await run(CC, 'resumo_geral')).erro);
  assert.equal(calls.length, 0);
});

test('IA: permissão ausente e papel desconhecido falham fechados, inclusive navegação', async () => {
  for (const role of ['desconhecido', 'gestor']) {
    const { CC, calls } = fixture({ role, permissions: [] });
    assert.ok((await run(CC, 'resumo_geral')).erro);
    if (role === 'desconhecido') {
      assert.equal(declarations(CC).length, 0);
      assert.ok((await run(CC, 'abrir_tela', { tela: 'inicio' })).erro);
    }
    assert.equal(calls.length, 0);
  }
});

test('IA: navegação declarada respeita acesso desktop e permissões específicas do gestor', async () => {
  const { CC } = fixture({ desktop: true, role: 'gestor', permissions: ['p1', 'p2', 'p10'] });
  CC.d.podeTela = (tela) => tela !== 'config';
  const telas = declarations(CC).find((d) => d.name === 'abrir_tela').parameters.properties.tela.enum;
  for (const tela of ['configuracoes', 'usuarios', 'historico', 'fechamento', 'recorrentes']) {
    assert.ok(!telas.includes(tela), tela);
    assert.ok((await run(CC, 'abrir_tela', { tela })).erro, tela);
  }
});

test('IA: navegação antiga é revalidada ao trocar de conta e supervisor antigo tem política técnica', async () => {
  const { CC, went, setUser } = fixture({ role: 'admin', permissions: ['p1', 'p2', 'p11'] });
  assert.equal((await run(CC, 'abrir_tela', { tela: 'nova_despesa' })).ok, true);
  const pending = CC.ia.pendingNav;
  setUser({ id: 21, role: 'supervisor', permissoes: ['p2', 'p12'] });
  pending();
  assert.equal(went.length, 0);
  assert.ok((await run(CC, 'buscar_lancamentos')).erro);
});
