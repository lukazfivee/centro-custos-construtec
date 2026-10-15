const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Passada S-C: a lista de competencias fechadas (GET /fechamento-mensal) serve a todos os papeis para travar
// lancamentos em mes fechado, mas as pendencias registradas no fechamento (com valores) sao so de quem fecha o mes (p8).
test('lista de fechamentos nao entrega pendencias com valores a quem nao tem p8', async (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'centro-custos-sc-fech-'));
  process.env.PGLITE_DATA_DIR = path.join(tempRoot, 'database');
  process.env.RESTORE_ROOT_DIR = path.join(tempRoot, 'restore');
  process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.ADMIN_INITIAL_PASSWORD = 'senha-teste-123';
  process.env.ADMIN_INITIAL_EMAIL = 'admin@teste.local';
  delete process.env.DATABASE_URL;

  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  const { createApp } = require('../server');
  await initializeDatabase();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  context.after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const call = async (method, url, token, body) => {
    const response = await fetch(`${base}${url}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  const login = async (email, senha) => {
    const r = await call('POST', '/auth/login', null, { email, senha });
    assert.equal(r.status, 200);
    return r.data.token;
  };

  const admin = await login('admin@teste.local', 'senha-teste-123');
  const fechado = await call('POST', '/fechamento-mensal', admin, { ano: 2026, mes: 1, pendencias: [{ chave: 'pagar_vencidas', titulo: 'Contas a pagar vencidas', quantidade: 3, valor: 48250.9, detalhe: 'Fornecedor atrasado' }] });
  assert.equal(fechado.status < 300, true, `fechar o mes: ${fechado.status} ${JSON.stringify(fechado.data)}`);

  const tokens = {};
  for (const role of ['tecnico', 'comercial', 'gestor']) {
    const email = `${role}@teste.local`;
    const criado = await call('POST', '/usuarios', admin, { nome: role, email, senha: `senha-${role}-123`, role: role === 'gestor' ? 'gestor' : 'supervisor' });
    assert.equal(criado.status, 201);
    await getDb().query('UPDATE users SET suite_role=$1 WHERE email=$2', [role, email]);
    tokens[role] = await login(email, `senha-${role}-123`);
  }

  // Quem fecha o mes (administrador, p8 na matriz padrao) continua vendo as pendencias.
  const doAdmin = await call('GET', '/fechamento-mensal', admin);
  assert.equal(doAdmin.status, 200);
  assert.equal(doAdmin.data[0].pendencias[0].valor, 48250.9);
  // Os demais sabem que o mes esta fechado (trava de lancamentos), sem as pendencias e seus valores.
  for (const role of ['tecnico', 'comercial', 'gestor']) {
    const { status, data } = await call('GET', '/fechamento-mensal', tokens[role]);
    assert.equal(status, 200);
    assert.equal(data.length, 1);
    assert.equal(data[0].year, 2026);
    assert.equal(data[0].month, 1);
    assert.equal('pendencias' in data[0], false, `${role} recebeu as pendencias do fechamento`);
    assert.doesNotMatch(JSON.stringify(data), /48250|Contas a pagar vencidas/);
  }
});
