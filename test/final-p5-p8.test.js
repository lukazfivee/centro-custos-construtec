const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('pacote final expõe banco, rateio, orçamento, inteligência e backup automático', () => {
  const migration = read('migrations/014_advanced_finance.sql');
  const route = read('routes/advanced.js');
  const server = read('server.js');
  const ui = read('public/chatgpt-final.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS bank_accounts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS bank_movements/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS transaction_allocations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS budget_revisions/);
  assert.match(route, /\/inteligencia\/resumo/);
  assert.match(route, /\/lancamentos\/acoes-em-massa/);
  assert.match(route, /\/extrato\/importar/);
  assert.match(route, /\/movimentos\/:id\/conciliar/);
  assert.match(route, /\/backup-config/);
  assert.match(server, /startAutoBackupScheduler/);
  assert.match(ui, /Central inteligente/);
  assert.match(ui, /Importar extrato \/ PIX/);
});

test('API final executa fluxo de produtividade, orçamento e conciliação', async (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-final-test-'));
  process.env.PGLITE_DATA_DIR = path.join(tempRoot, 'database');
  process.env.RESTORE_ROOT_DIR = path.join(tempRoot, 'restore');
  process.env.JWT_SECRET = 'segredo-final-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.ADMIN_INITIAL_PASSWORD = 'senha-final-123';
  process.env.ADMIN_INITIAL_EMAIL = 'admin-final@teste.local';
  process.env.INSTANCE_NAME = 'Teste Final';

  const { initializeDatabase, closeDatabase } = require('../db');
  const { createApp } = require('../server');
  await initializeDatabase();
  let server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  context.after(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(tempRoot, { recursive:true, force:true });
  });

  async function request(route, options={}) {
    const response = await fetch(base + route, {
      method:options.method || 'GET',
      headers:{ ...(options.token ? {Authorization:`Bearer ${options.token}`} : {}), ...(options.body ? {'Content-Type':'application/json'} : {}) },
      body:options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json();
    assert.equal(response.ok, true, data.erro || `HTTP ${response.status}`);
    return data;
  }

  const login = await request('/auth/login', {method:'POST',body:{email:'admin-final@teste.local',senha:'senha-final-123'}});
  const token = login.token;
  const center = await request('/centros-custo', {method:'POST',token,body:{codigo:'FINAL-01',nome:'Obra Final',orcamento:10000,valor_contrato:20000,situacao:'execucao'}});
  const categories = await request('/categorias', {token});
  const material = categories.find((c) => c.nome === 'Material');
  assert.ok(material?.id);
  const tx = await request('/lancamentos', {method:'POST',token,body:{tipo:'despesa',cost_center_id:center.id,category_id:material.id,descricao:'Material Cora',favorecido:'Fornecedor Final',valor:350,data:'2026-08-20',vencimento:'2026-08-20',status_financeiro:'pendente',forma_pagamento:'PIX'}});

  const intelligence = await request('/avancado/inteligencia/resumo', {token});
  assert.equal(Array.isArray(intelligence.fluxo), true);
  assert.equal(Array.isArray(intelligence.curvaABC), true);

  const suggestion = await request('/avancado/sugestoes?favorecido=Fornecedor%20Final', {token});
  assert.equal(suggestion.sugestoes[0].category_id, material.id);

  await request('/avancado/visoes', {method:'POST',token,body:{nome:'Pendentes teste',filtros:{situacao:'pendente'}}});
  const views = await request('/avancado/visoes', {token});
  assert.equal(views.length, 1);

  await request('/avancado/orcamentos/' + center.id + '/revisar', {method:'POST',token,body:{valor:12000,tipo:'aditivo',motivo:'Aditivo aprovado para teste'}});
  const revisions = await request('/avancado/orcamentos/' + center.id, {token});
  assert.equal(revisions[0].new_amount, 12000);

  const account = await request('/avancado/contas', {method:'POST',token,body:{nome:'Cora Teste',banco:'Cora',tipo:'corrente',saldo_inicial:1000}});
  const imported = await request('/avancado/extrato/importar', {method:'POST',token,body:{conta_id:account.id,origem:'cora_csv',movimentos:[{data:'2026-08-20',descricao:'PIX Fornecedor Final',favorecido:'Fornecedor Final',valor:-350,direcao:'saida'}]}});
  assert.equal(imported.incluidos, 1);
  const duplicate = await request('/avancado/extrato/importar', {method:'POST',token,body:{conta_id:account.id,origem:'cora_csv',movimentos:[{data:'2026-08-20',descricao:'PIX Fornecedor Final',favorecido:'Fornecedor Final',valor:-350,direcao:'saida'}]}});
  assert.equal(duplicate.ignorados, 1);
  const movements = await request('/avancado/movimentos?pendente=1', {token});
  assert.equal(movements.length, 1);
  const matches = await request(`/avancado/movimentos/${movements[0].id}/sugestoes`, {token});
  assert.equal(matches[0].id, tx.id);
  await request(`/avancado/movimentos/${movements[0].id}/conciliar`, {method:'POST',token,body:{lancamento_id:tx.id}});
  const pendingAfter = await request('/avancado/movimentos?pendente=1', {token});
  assert.equal(pendingAfter.length, 0);

  const backup = await request('/avancado/backup-config', {token});
  assert.equal(typeof backup.ativo, 'boolean');
  const configured = await request('/avancado/backup-config', {method:'PUT',token,body:{ativo:true,hora:19,retencao:10}});
  assert.equal(configured.ativo, true);

  const bulk = await request('/avancado/lancamentos/acoes-em-massa', {method:'POST',token,body:{ids:[tx.id],acao:'forma_pagamento',valor:'PIX Cora'}});
  assert.equal(bulk.alterados, 1);
});
