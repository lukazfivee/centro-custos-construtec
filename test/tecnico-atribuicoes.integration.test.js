const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('atribuição de técnicos dentro de obras e serviços independentes', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-atribuicoes-'));
  process.env.DATABASE_URL = '';
  process.env.PGLITE_DATA_DIR = path.join(dir, 'db');
  process.env.RESTORE_ROOT_DIR = path.join(dir, 'restore');
  process.env.JWT_SECRET = 'atribuicoes-test-secret-com-mais-de-trinta-e-dois';
  process.env.ADMIN_INITIAL_EMAIL = 'atribuicoes@teste.local';
  process.env.ADMIN_INITIAL_PASSWORD = 'atribuicoes-test-123';
  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  const { createApp } = require('../server');
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(route, method = 'GET', body, token = admin, expected = 200) {
    const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    assert.equal(r.status, expected, `${method} ${route}: ${text}`);
    return JSON.parse(text);
  }
  const login = async (email) => (await call('/auth/login', 'POST', { email, senha: 'atribuicoes-test-123' }, '', 200)).token;
  const admin = await login('atribuicoes@teste.local');
  async function user(nome, suiteRole, active = true) {
    const email = `${nome}@teste.local`;
    await call('/usuarios', 'POST', { nome, email, senha: 'atribuicoes-test-123', role: 'supervisor' }, admin, 201);
    const row = (await getDb().query('UPDATE users SET suite_role=$1,active=$2 WHERE email=$3 RETURNING id', [suiteRole, active, email])).rows[0];
    return { id: Number(row.id), token: active ? await login(email) : '' };
  }
  const a = await user('ana', 'tecnico');
  const b = await user('bruno', 'tecnico');
  const inativo = await user('inativo', 'tecnico', false);
  const financeiro = await user('financeiro', 'financeiro');
  const gestor = await user('gestor', 'gestor');
  const obra = await call('/centros-custo', 'POST', { codigo: 'ATR-1', nome: 'Obra atribuída', tipo: 'obra' }, admin, 201);
  const servico = await call('/servicos', 'POST', { cliente: 'Cliente', valor: 500, descricao: 'Serviço independente' }, admin, 201);
  const url = `/centros-custo/${obra.id}/tecnicos`;

  await t.test('seleção mínima disponível para administrador e gestor, nunca para técnico', async () => {
    const data = await call(url);
    assert.deepEqual(data.atribuidos, []);
    assert.deepEqual(data.tecnicos.map((u) => u.id).sort(), [a.id, b.id].sort());
    assert.deepEqual(Object.keys(data.tecnicos[0]).sort(), ['id', 'nome']);
    await call(url, 'GET', undefined, gestor.token);
    await call(url, 'GET', undefined, a.token, 403);
    await call(url, 'PUT', { tecnicos: [a.id], anteriores: [] }, a.token, 403);
  });
  await t.test('atribuir uma obra não atribui um serviço independente', async () => {
    await call(url, 'PUT', { tecnicos: [a.id, b.id], anteriores: [] });
    assert.deepEqual((await call(url)).atribuidos, [a.id, b.id].sort((x, y) => x - y));
    assert.deepEqual((await call('/centros-custo', 'GET', undefined, a.token)).map((o) => o.id), [obra.id]);
    await call(`/centros-custo/${obra.id}/detalhes`, 'GET', undefined, a.token);
    await call(`/servicos/${servico.id}`, 'GET', undefined, a.token, 403);
    await call(`/centros-custo/${servico.id}/tecnicos`, 'PUT', { tecnicos: [a.id], anteriores: [] });
    assert.equal((await call(`/servicos/${servico.id}`, 'GET', undefined, a.token)).id, servico.id);
  });
  await t.test('valida usuários e revisão sem alterar seleção em caso de erro', async () => {
    for (const id of [inativo.id, financeiro.id, 9999999, -1, '1']) {
      await call(url, 'PUT', { tecnicos: [id], anteriores: [a.id, b.id] }, admin, 400);
    }
    await call(url, 'PUT', { tecnicos: [a.id] }, admin, 400);
    await call(url, 'PUT', { tecnicos: [a.id], anteriores: [] }, admin, 409);
    assert.deepEqual((await call(url)).atribuidos, [a.id, b.id].sort((x, y) => x - y));
    await call('/centros-custo/9999999/tecnicos', 'GET', undefined, admin, 404);
  });
  await t.test('remoção revoga imediatamente e preserva atribuição independente', async () => {
    await call(url, 'PUT', { tecnicos: [b.id], anteriores: [a.id, b.id] }, gestor.token);
    await call(`/centros-custo/${obra.id}/detalhes`, 'GET', undefined, a.token, 403);
    assert.equal((await call(`/servicos/${servico.id}`, 'GET', undefined, a.token)).id, servico.id);
    const audits = await getDb().query("SELECT data FROM audit_log WHERE entity_type='centro_custo' AND action='tecnicos_atribuidos'");
    assert.ok(audits.rows.length >= 3);
  });
  await t.test('sessão do técnico não contorna proteção pelo proxy de orçamentos', async () => {
    const origin = base.replace(/\/api$/, '');
    for (const route of ['/orcamentos-api/api/propostas', '/api/propostas-inexistentes']) {
      const response = await fetch(origin + route, { headers: { Authorization: `Bearer ${a.token}`, Referer: origin + '/orcamentos/' } });
      assert.equal(response.status, 403);
    }
  });
});
