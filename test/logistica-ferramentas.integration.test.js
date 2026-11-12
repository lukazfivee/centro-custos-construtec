const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

test('logística controla ferramentas, escopo do técnico e entregas idempotentes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-logistica-ferramentas-'));
  Object.assign(process.env, { DATABASE_URL: '', PGLITE_DATA_DIR: path.join(root, 'db'),
    RESTORE_ROOT_DIR: path.join(root, 'restore'), JWT_SECRET: 'logistica-ferramentas-test-secret-32-characters',
    ADMIN_INITIAL_PASSWORD: 'admin-test-123456', ADMIN_INITIAL_EMAIL: 'logistica@teste.local' });
  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  await initializeDatabase();
  const db = getDb();
  const server = require('../server').createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); });
  const ids = {};
  for (const [key, role, name] of [['admin', 'admin', 'Admin'], ['gestor', 'gestor', 'Gestor'],
    ['tecA', 'tecnico', 'Técnico A'], ['tecB', 'tecnico', 'Técnico B']]) {
    const legacyRole = role === 'tecnico' ? 'supervisor' : role;
    const row = (await db.query('INSERT INTO users(name,email,password_hash,role,suite_role,all_cost_centers) VALUES($1,$2,\'unused\',$3,$4,TRUE) RETURNING id',
      [name, `${key}@logistica.test`, legacyRole, role])).rows[0];
    ids[key] = row.id;
  }
  const token = (id) => jwt.sign({ sub: id }, process.env.JWT_SECRET);
  const auth = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, token(id)]));
  async function call(route, method = 'GET', body, expected = 200, who = 'gestor') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/logistica${route}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth[who]}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    assert.equal(response.status, expected, `${method} ${route}: ${text}`);
    return text ? JSON.parse(text) : null;
  }

  await t.test('somente admin ou gestor cadastra ferramenta', async () => {
    const item = await call('/ferramentas', 'POST', { nome: 'Parafusadeira', codigo: 'PAT-001' }, 201);
    ids.tool = item.id;
    await call('/ferramentas', 'POST', { nome: 'Chave de fenda', codigo: 'PAT-002' }, 403, 'tecA');
    await call('/ferramentas', 'POST', { nome: 'Chave estrela', codigo: 'PAT-003' }, 201, 'admin');
  });

  await t.test('código patrimonial duplicado é rejeitado', async () => {
    await call('/ferramentas', 'POST', { nome: 'Duplicada', codigo: 'pat-001' }, 409);
  });

  await t.test('técnico com acesso global legado só consulta o próprio kit', async () => {
    const receipt = await call('/entregas', 'POST', { tecnicoId: ids.tecA, ferramentaIds: [ids.tool], client_id: 'entrega-escopo' }, 201);
    ids.receipt = receipt.id;
    const own = await call('/meu-kit', 'GET', undefined, 200, 'tecA');
    assert.ok(own.ferramentas.some((item) => item.id === ids.tool));
    const other = await call('/meu-kit', 'GET', undefined, 200, 'tecB');
    assert.equal(other.ferramentas.some((item) => item.id === ids.tool), false);
  });

  await t.test('entrega exige ferramenta disponível e técnico válido', async () => {
    await call('/entregas', 'POST', { tecnicoId: ids.tecB, ferramentaIds: [ids.tool], client_id: 'outra-entrega' }, 409);
    await call('/entregas', 'POST', { tecnicoId: 999999, ferramentaIds: [ids.tool], client_id: 'tecnico-invalido' }, 404);
  });

  await t.test('client_id repetido não duplica a entrega', async () => {
    const first = await call('/entregas', 'POST', { tecnicoId: ids.tecA, ferramentaIds: [ids.tool], client_id: 'entrega-escopo' }, 201);
    assert.equal(first.id, ids.receipt);
    const count = (await db.query('SELECT COUNT(*)::int AS total FROM logistica_recibos WHERE client_id=$1', ['entrega-escopo'])).rows[0].total;
    assert.equal(count, 1);
  });

  await t.test('duas entregas concorrentes não atribuem a unidade duas vezes', async () => {
    const tool = await call('/ferramentas', 'POST', { nome: 'Alicate', codigo: 'PAT-CONCORRENTE' }, 201);
    const attempts = await Promise.allSettled([
      call('/entregas', 'POST', { tecnicoId: ids.tecA, ferramentaIds: [tool.id], client_id: 'concorrente-a' }, 201),
      call('/entregas', 'POST', { tecnicoId: ids.tecB, ferramentaIds: [tool.id], client_id: 'concorrente-b' }, 201),
    ]);
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1);
  });

  await t.test('kit padrão pode ser configurado pela logística', async () => {
    const result = await call('/kits/padrao', 'PUT', { itens: [{ nome: 'Alicate', quantidade: 2 }] }, 200);
    assert.equal(result.itens[0].nome, 'Alicate');
    assert.equal(result.itens[0].quantidade, 2);
    await call('/kits/padrao', 'PUT', { itens: [{ nome: 'Alicate', quantidade: 2 }] }, 403, 'tecA');
  });

  await t.test('conferência inicial recebe data de hoje e mantém recibo para assinatura', async () => {
    const tool = await call('/ferramentas', 'POST', { nome: 'Multímetro', codigo: 'PAT-CONFERENCIA' }, 201);
    const receipt = await call('/conferencias-iniciais', 'POST', { tecnicoId: ids.tecB, ferramentaIds: [tool.id], client_id: 'conf-inicial-1' }, 201);
    assert.equal(receipt.tipo, 'conferencia_inicial');
    assert.equal(receipt.status, 'aguardando_assinatura');
    assert.equal(new Date(receipt.criado_em).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
    assert.equal(receipt.ferramentas[0].codigo, 'PAT-CONFERENCIA');
  });

  await t.test('assinatura é do técnico destinatário, validada e idempotente', async () => {
    const tool = await call('/ferramentas', 'POST', { nome: 'Chave estrela', codigo: 'PAT-ASSINATURA' }, 201);
    const receipt = await call('/entregas', 'POST', { tecnicoId: ids.tecA, ferramentaIds: [tool.id], client_id: 'entrega-assinatura' }, 201);
    const dataHora = new Date().toISOString();
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
    const body = { dataHora, client_id: 'assinatura-1', assinatura: { conteudoBase64: `data:image/png;base64,${png}` } };
    await call(`/entregas/${receipt.id}/assinatura`, 'PUT', { ...body, assinatura: { conteudoBase64: 'not-an-image' } }, 400, 'tecA');
    await call(`/entregas/${receipt.id}/assinatura`, 'PUT', body, 403, 'tecB');
    await call(`/entregas/${receipt.id}/assinatura`, 'PUT', body, 403, 'gestor');
    const signed = await call(`/entregas/${receipt.id}/assinatura`, 'PUT', body, 200, 'tecA');
    assert.equal(signed.status, 'assinado');
    assert.equal(new Date(signed.assinado_em).toISOString(), dataHora);
    const repeated = await call(`/entregas/${receipt.id}/assinatura`, 'PUT', body, 200, 'tecA');
    assert.equal(repeated.status, 'assinado');
    const count = (await db.query('SELECT COUNT(*)::int AS total FROM logistica_eventos WHERE recibo_id=$1 AND tipo=\'assinado\'', [receipt.id])).rows[0].total;
    assert.equal(count, 1);
  });

  await t.test('falta permanece aberta até reposição e devolução avariada passa por avaliação', async () => {
    const missing = await call('/ferramentas', 'POST', { nome: 'Alicate universal', codigo: 'PAT-FALTA' }, 201);
    await call('/entregas', 'POST', { tecnicoId: ids.tecA, ferramentaIds: [missing.id], client_id: 'entrega-falta' }, 201);
    const reported = await call('/faltas', 'POST', { ferramentaId: missing.id, relato: 'Sumiu durante o serviço' }, 201, 'tecA');
    assert.equal(reported.situacao, 'em_falta');
    const apurada = await call(`/faltas/${reported.id}/apuracao`, 'POST', { apuracao: 'Equipe não localizou; registrada como desaparecida' }, 200);
    assert.equal(apurada.estado, 'aberta');
    const replacement = await call('/ferramentas', 'POST', { nome: 'Alicate universal', codigo: 'PAT-REPOSICAO' }, 201);
    const replacementReceipt = await call('/entregas', 'POST', { tecnicoId: ids.tecA, ferramentaIds: [replacement.id], client_id: 'entrega-reposicao' }, 201);
    assert.equal((await db.query('SELECT estado FROM logistica_faltas WHERE id=$1', [reported.id])).rows[0].estado, 'aberta');
    const signature = { dataHora: new Date().toISOString(), client_id: 'assinatura-reposicao', assinatura: { conteudoBase64: `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')}` } };
    await call(`/entregas/${replacementReceipt.id}/assinatura`, 'PUT', signature, 200, 'tecA');
    const state = (await db.query('SELECT situacao,tecnico_id FROM logistica_ferramentas WHERE id=$1', [missing.id])).rows[0];
    assert.equal(state.situacao, 'baixada');
    assert.equal(state.tecnico_id, null);
    const resolved = (await db.query('SELECT estado,apuracao FROM logistica_faltas WHERE id=$1', [reported.id])).rows[0];
    assert.equal(resolved.estado, 'reposta');
    assert.equal(resolved.apuracao, 'Equipe não localizou; registrada como desaparecida');

    const damaged = await call('/ferramentas', 'POST', { nome: 'Parafusadeira', codigo: 'PAT-AVARIA' }, 201);
    await call('/entregas', 'POST', { tecnicoId: ids.tecB, ferramentaIds: [damaged.id], client_id: 'entrega-avaria' }, 201);
    const returned = await call(`/ferramentas/${damaged.id}/devolucao`, 'POST', { condicao: 'avariada', observacao: 'Mandril travado após uso' }, 200);
    assert.equal(returned.situacao, 'em_avaliacao');
    const evaluated = await call(`/ferramentas/${damaged.id}/avaliacao`, 'POST', { resultado: 'reparada', motivo: 'Mandril substituído e testado' }, 200);
    assert.equal(evaluated.situacao, 'disponivel');
    const history = await call(`/ferramentas/${damaged.id}/historico`);
    assert.ok(history.some((item) => item.tipo === 'devolucao_avariada'));
    assert.ok(history.some((item) => item.tipo === 'reparada'));
  });

  await t.test('fichas pendentes listam assinatura e divergência para a logística, nunca para o técnico', async () => {
    const tool = await call('/ferramentas', 'POST', { nome: 'Trena', codigo: 'PAT-FICHAS' }, 201);
    const receipt = await call('/entregas', 'POST', { tecnicoId: ids.tecB, ferramentaIds: [tool.id], client_id: 'entrega-fichas' }, 201);
    await call('/recibos-pendentes', 'GET', undefined, 403, 'tecA');
    const aguardando = (await call('/recibos-pendentes')).find((item) => item.id === receipt.id);
    assert.equal(aguardando.status, 'aguardando_assinatura');
    assert.equal(aguardando.tecnico, 'Técnico B');

    await call(`/entregas/${receipt.id}/divergencia`, 'POST', { relato: 'Falta a trena de 5 metros' }, 200, 'tecB');
    const lista = await call('/recibos-pendentes');
    assert.equal(lista[0].id, receipt.id, 'divergência vem primeiro');
    assert.equal(lista[0].status, 'divergencia');
    assert.equal(lista[0].divergencia, 'Falta a trena de 5 metros');

    await call(`/entregas/${receipt.id}/revisao`, 'POST', { revisao: 'Conferido com o técnico; ficha correta' }, 200);
    assert.equal((await call('/recibos-pendentes')).find((item) => item.id === receipt.id).status, 'aguardando_assinatura');
  });
});
