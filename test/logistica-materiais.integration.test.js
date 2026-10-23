const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

test('logística controla saldo, pedidos, entregas parciais e devolução de material', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-logistica-materiais-'));
  Object.assign(process.env, { DATABASE_URL: '', PGLITE_DATA_DIR: path.join(root, 'db'), RESTORE_ROOT_DIR: path.join(root, 'restore'),
    JWT_SECRET: 'logistica-materiais-test-secret-32-characters', ADMIN_INITIAL_PASSWORD: 'admin-test-123456', ADMIN_INITIAL_EMAIL: 'materiais@teste.local' });
  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  await initializeDatabase(); const db = getDb();
  const server = require('../server').createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); });
  const ids = {};
  for (const [key, role] of [['gestor', 'gestor'], ['tecA', 'tecnico'], ['tecB', 'tecnico']]) {
    const row = (await db.query('INSERT INTO users(name,email,password_hash,role,suite_role,all_cost_centers) VALUES($1,$2,\'unused\',$3,$4,TRUE) RETURNING id', [key, `${key}@materiais.test`, role === 'tecnico' ? 'supervisor' : role, role])).rows[0];
    ids[key] = row.id;
  }
  const center = (await db.query("INSERT INTO cost_centers(code,name,kind,public_id) VALUES('OB-LOGI','Obra logística','obra',gen_random_uuid()) RETURNING id")).rows[0];
  ids.center = center.id;
  await db.query('INSERT INTO user_cost_centers(user_id,cost_center_id) VALUES($1,$2)', [ids.tecA, ids.center]);
  await db.query('INSERT INTO user_cost_centers(user_id,cost_center_id) VALUES($1,$2)', [ids.gestor, ids.center]);
  const token = Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, jwt.sign({ sub: value }, process.env.JWT_SECRET)]));
  async function call(route, method = 'GET', body, expected = 200, who = 'gestor') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/logistica${route}`, { method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token[who]}` }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const text = await response.text(); assert.equal(response.status, expected, `${method} ${route}: ${text}`); return text ? JSON.parse(text) : null;
  }

  const material = await call('/materiais', 'POST', { nome: 'Conector RJ45', unidade: 'un', saldoInicial: 3, estoqueMinimo: 1, exigeRetorno: true }, 201);
  ids.material = material.id;
  await call('/materiais', 'POST', { nome: 'Material indevido', unidade: 'un' }, 403, 'tecA');
  assert.equal(Number((await call('/materiais'))[0].saldo), 3);
  await call('/materiais/entregas', 'POST', { tecnicoId: ids.gestor, centroId: ids.center, itens: [{ materialId: ids.material, quantidade: 1 }], client_id: 'entrega-nao-tecnica' }, 403);
  assert.equal(Number((await call('/materiais'))[0].saldo), 3);
  await call('/materiais/solicitacoes', 'POST', { centroId: ids.center, materialId: ids.material, quantidade: 5, client_id: 'pedido-material-001' }, 201, 'tecA');
  await call('/materiais/solicitacoes', 'POST', { centroId: ids.center, materialId: ids.material, quantidade: 5, client_id: 'pedido-material-001' }, 201, 'tecA');
  await call('/materiais/solicitacoes', 'POST', { centroId: ids.center, materialId: ids.material, quantidade: 5, client_id: 'pedido-material-002' }, 403, 'tecB');
  const request = (await call('/materiais/solicitacoes'))[0];
  const issue = await call('/materiais/entregas', 'POST', { tecnicoId: ids.tecA, centroId: ids.center, solicitacaoId: request.id,
    itens: [{ materialId: ids.material, quantidade: 5 }], client_id: 'entrega-material-001' }, 201);
  assert.equal(Number(issue.itens[0].entregue), 3);
  assert.equal((await call('/materiais/solicitacoes'))[0].status, 'parcial');
  assert.equal(Number((await call('/materiais'))[0].saldo), 0);
  const receipt = await call(`/entregas/${issue.id}`, 'GET', undefined, 200, 'tecA');
  assert.equal(receipt.status, 'aguardando_assinatura');
  assert.equal(Number(receipt.materiais[0].quantidade), 3);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');
  await call(`/entregas/${issue.id}/assinatura`, 'PUT', { dataHora: new Date().toISOString(), client_id: 'assinatura-material-inicial', assinatura: { conteudoBase64: `data:image/png;base64,${png}` } }, 200, 'tecA');
  const returns = await call('/materiais/devolucoes-pendentes');
  assert.equal(returns.length, 1);
  assert.equal(Number(returns[0].recibo_id), Number(issue.id));
  assert.equal(Number(returns[0].pendente), 3);
  await call('/materiais/devolucoes-pendentes', 'GET', undefined, 403, 'tecA');
  await call('/materiais/devolucoes', 'POST', { reciboId: issue.id, materialId: ids.material, quantidade: 2, client_id: 'retorno-001' }, 200, 'gestor');
  assert.equal(Number((await call('/materiais/devolucoes-pendentes'))[0].pendente), 1);
  await call('/materiais/devolucoes', 'POST', { reciboId: issue.id, materialId: ids.material, quantidade: 2, client_id: 'retorno-excedido' }, 409, 'gestor');
  assert.equal(Number((await call('/materiais'))[0].saldo), 2);
  const finalIssue = await call('/materiais/entregas', 'POST', { tecnicoId: ids.tecA, centroId: ids.center, solicitacaoId: request.id,
    itens: [{ materialId: ids.material, quantidade: 2 }], client_id: 'entrega-material-final' }, 201);
  assert.equal((await call('/materiais/solicitacoes'))[0].status, 'aguardando_assinatura');
  await call(`/entregas/${finalIssue.id}/assinatura`, 'PUT', { dataHora: new Date().toISOString(), client_id: 'assinatura-material-final', assinatura: { conteudoBase64: `data:image/png;base64,${png}` } }, 200, 'tecA');
  assert.equal((await call('/materiais/solicitacoes'))[0].status, 'concluida');
  assert.equal(Number((await call('/materiais'))[0].saldo), 0);
  await call('/materiais/entregas', 'POST', { tecnicoId: ids.tecB, centroId: ids.center, itens: [{ materialId: ids.material, quantidade: 1 }], client_id: 'entrega-sem-vinculo' }, 403);
  const ledger = await call('/materiais/movimentacoes');
  assert.deepEqual(ledger.map((row) => row.tipo).sort(), ['devolucao', 'entrada', 'entrega', 'entrega']);
  const stock = await call('/materiais', 'POST', { nome: 'Parafuso M6', unidade: 'un', saldoInicial: 1 }, 201);
  const attempts = await Promise.allSettled(['disputa-a', 'disputa-b'].map((client_id) => call('/materiais/entregas', 'POST', {
    tecnicoId: ids.tecA, centroId: ids.center, itens: [{ materialId: stock.id, quantidade: 1 }], client_id,
  }, 201)));
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(Number((await call('/materiais')).find((item) => Number(item.id) === Number(stock.id)).saldo), 0);
});
