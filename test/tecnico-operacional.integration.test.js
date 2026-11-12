const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

test('técnico só executa itens atribuídos e nunca recebe dados financeiros', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tecnico-operacional-'));
  Object.assign(process.env, { DATABASE_URL: '', PGLITE_DATA_DIR: path.join(root, 'db'),
    RESTORE_ROOT_DIR: path.join(root, 'restore'), JWT_SECRET: 'tecnico-operacional-test-secret-32-characters',
    ADMIN_INITIAL_PASSWORD: 'admin-test-123456', ADMIN_INITIAL_EMAIL: 'operacional@teste.local' });
  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  await initializeDatabase();
  const db = getDb();
  const server = require('../server').createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); });
  const adminId = (await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1")).rows[0].id;
  const techId = (await db.query("INSERT INTO users(name,email,password_hash,role,suite_role,all_cost_centers) VALUES('Campo','campo@teste.local','unused','supervisor','tecnico',TRUE) RETURNING id")).rows[0].id;
  const token = (id) => jwt.sign({ sub: id }, process.env.JWT_SECRET);
  const admin = token(adminId), tech = token(techId);
  async function call(route, method = 'GET', body, expected = 200, auth = tech) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    assert.equal(response.status, expected, `${method} ${route}: ${text}`);
    return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
  }
  const obra = await call('/centros-custo', 'POST', { codigo: 'OB-TEC', nome: 'Obra atribuída', orcamento: 900, valor_contrato: 1200 }, 201, admin);
  const service = await call('/servicos', 'POST', { cliente: 'Cliente', valor: 450, local: 'Rua A', descricao: 'Instalação' }, 201, admin);
  await call(`/servicos/${service.id}/gastos`, 'POST', { tipo: 'material', valor: 73 }, 201, admin);
  await t.test('flag global antiga não libera nenhuma obra ou serviço', async () => {
    assert.deepEqual(await call('/centros-custo'), []);
    assert.deepEqual(await call('/servicos'), []);
    await call(`/centros-custo/${obra.id}/detalhes`, 'GET', undefined, 403);
    await call(`/servicos/${service.id}`, 'GET', undefined, 403);
    await call(`/servicos/${service.id}/checklist`, 'PUT', { itens: [] }, 403);
  });
  await db.query('INSERT INTO user_cost_centers(user_id,cost_center_id) VALUES($1,$2),($1,$3)', [techId, obra.id, service.id]);
  await t.test('gestão de acesso não oferece acesso global fictício ao técnico', async () => {
    const users = await call('/usuarios', 'GET', undefined, 200, admin);
    assert.equal(users.find((u) => u.id === techId).todasObras, false);
    await call(`/usuarios/${techId}/acesso`, 'PUT', { suiteRole: 'tecnico', obras: 'todas' }, 400, admin);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM user_cost_centers WHERE user_id=$1', [techId])).rows[0].n, 2);
    await call('/usuarios', 'POST', { nome: 'Engenheira', email: 'eng@teste.local', senha: 'senha-engenharia-123', suiteRole: 'engenharia', obras: 'todas' }, 201, admin);
    const { setObras } = require('../services/userAccess');
    await assert.rejects(setObras(db, techId, 'todas'), (error) => error.statusCode === 400);
  });
  await t.test('listas e detalhes contêm somente metadados operacionais', async () => {
    const list = await call('/centros-custo');
    const detail = await call(`/centros-custo/${obra.id}/detalhes`);
    assert.equal(list.length, 2);
    assert.equal(detail.centro.nome, 'Obra atribuída');
    for (const item of [...list, detail.centro]) {
      for (const key of ['valor_contrato','contrato','orcamento','total_despesas','total_receitas','total_comprometido','proposta_origem']) assert.equal(item[key], undefined, key);
    }
    assert.equal(detail.lancamentos, undefined);
    const svc = await call(`/servicos/${service.id}`);
    assert.equal(svc.local, 'Rua A');
    for (const key of ['valor','gastos','resumo','faturamento']) assert.equal(svc[key], undefined, key);
    const services = await call('/servicos');
    assert.equal(services[0].gastos, undefined);
    assert.equal((await call('/centros-custo?pagina=1&limite=1')).itens[0].orcamento, undefined);
  });
  await t.test('leitura financeira e exportações bloqueadas até para obra atribuída', async () => {
    for (const route of ['/dashboard/resumo','/fornecedores','/categorias','/lancamentos','/lancamentos/1','/anexos/lancamento/1',
      '/produtividade/sugestoes','/bancos/contas','/insights/atencao','/historico','/recorrentes','/sincronizacao/exportar.csv',
      '/sincronizacao-inteligente','/cloud-sync/status','/backup','/cadastro-sync','/assistente/orcamentos/propostas',
      `/centros-custo/${obra.id}/curva-s`,`/centros-custo/${obra.id}/orcado-realizado`,`/centros-custo/${obra.id}/propostas`,
      `/centros-custo/${obra.id}/medicoes`,`/servicos/${service.id}/gastos`,`/servicos/${service.id}/resumo`]) await call(route, 'GET', undefined, 403);
    await call(`/servicos/${service.id}/gastos`, 'POST', { tipo: 'outros', valor: 1 }, 403);
    await call('/lancamentos', 'POST', {}, 403);
    await call(`/servicos/${service.id}/faturar`, 'POST', {}, 403);
    assert.equal((await call('/dashboard/resumo', 'GET', undefined, 200, admin)).despesas !== undefined, true);
  });
  await t.test('chave de integração não sobrepõe a sessão do técnico', async () => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/integracao/orcamentos/portfolio-summary`, {
      headers: { Authorization: `Bearer ${tech}`, 'x-construtec-integration-key': 'construtec-internal-integration-secret-2026' },
    });
    assert.equal(response.status, 403);
  });
  await t.test('execução continua disponível sem p2 financeiro', async () => {
    const access = await call('/auth/me');
    assert.equal(access.permissoes.includes('p2'), false);
    assert.equal(access.todasObras, false);
    await call(`/servicos/${service.id}/situacao`, 'PUT', { situacao: 'em_andamento' });
    const checklist = await call(`/servicos/${service.id}/checklist`, 'PUT', { itens: [{ texto: 'Conferir' }] });
    await call(`/servicos/${service.id}/checklist/${checklist.itens[0].id}`, 'PATCH', { feito: true });
    await call(`/servicos/${service.id}/observacoes`, 'PUT', { descricao: 'Executado', anterior: 'Instalação' });
    const photo = Buffer.from([255,216,255,224,1,2,3]).toString('base64');
    const sent = await call(`/servicos/${service.id}/fotos`, 'POST', { fase: 'antes', nome: 'antes.jpg', tipo: 'image/jpeg', conteudoBase64: photo }, 201);
    await call(`/servicos/${service.id}/fotos/${sent.id}/arquivo`);
    await call(`/servicos/${service.id}/concluir`, 'POST', { comPendencias: true });
  });
  await t.test('revogar bloqueia leitura e escrita na próxima requisição', async () => {
    await db.query('DELETE FROM user_cost_centers WHERE user_id=$1', [techId]);
    await call(`/servicos/${service.id}`, 'GET', undefined, 403);
    await call(`/servicos/${service.id}/checklist`, 'PUT', { itens: [] }, 403);
    await call(`/centros-custo/${obra.id}/detalhes`, 'GET', undefined, 403);
    assert.deepEqual(await call('/centros-custo'), []);
  });
});
