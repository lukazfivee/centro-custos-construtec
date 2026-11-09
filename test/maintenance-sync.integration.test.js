const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('sincronização transfere competências e destinações para outra instalação', async (t) => {
  const temp = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-manut-sync-')));
  const prior = { ...process.env };
  const priorFetch = global.fetch;
  process.env.DATABASE_URL = '';
  process.env.RESTORE_ROOT_DIR = path.join(temp, 'restore');
  process.env.JWT_SECRET = 'maintenance-sync-integration-test-secret-32';
  process.env.ADMIN_INITIAL_EMAIL = 'manutencao-sync@teste.local';
  process.env.ADMIN_INITIAL_PASSWORD = 'maintenance-sync-test';
  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  const { insertTransaction } = require('../lib/transactionInsert');
  const { currentMonth, todayIso } = require('../lib/dates');
  const { ensurePeriods, balance } = require('../services/maintenanceBalance');
  const { buildPackage, importPackage } = require('../services/smartSync');
  t.after(async () => {
    await closeDatabase();
    global.fetch = priorFetch;
    for (const key of ['DATABASE_URL','RESTORE_ROOT_DIR','PGLITE_DATA_DIR','JWT_SECRET','ADMIN_INITIAL_EMAIL','ADMIN_INITIAL_PASSWORD','SYNC_API_URL']) {
      if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
    }
    assert.ok(temp.startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temp, { recursive:true, force:true });
  });

  process.env.PGLITE_DATA_DIR = path.join(temp, 'origem');
  await initializeDatabase();
  let db = getDb();
  const user = { id:1, name:'Administrador' };
  const source = (await db.query(`INSERT INTO cost_centers(public_id,code,name,kind,monthly_budget)
    VALUES($1,'MAN-1','Contrato de teste','contrato_manutencao',1000) RETURNING id,public_id`, [crypto.randomUUID()])).rows[0];
  const dest = (await db.query(`INSERT INTO cost_centers(public_id,code,name) VALUES($1,'OB-1','Obra de teste') RETURNING id`, [crypto.randomUUID()])).rows[0];
  const category = (await db.query("SELECT id FROM categories WHERE name='Vendas e serviços'")).rows[0].id;
  const date = todayIso();
  await db.transaction(async (tx) => {
    await ensurePeriods(tx, { id:source.id,active:true,monthly_budget:1000,start_date:`${currentMonth()}-01` });
    const receipt = await insertTransaction({ type:'receita',costCenterId:source.id,categoryId:category,description:'Sobra',
      counterparty:null,amount:100,date,notes:null,dueDate:date,settlementDate:null,financialStatus:'pendente',documentNumber:null,paymentMethod:null }, user, null, tx);
    await tx.query(`INSERT INTO maintenance_movements(public_id,cost_center_id,destination_id,amount,movement_date,created_by)
      VALUES($1,$2,$3,200,$4,$5)`, [crypto.randomUUID(),source.id,dest.id,date,user.id]);
    await tx.query(`INSERT INTO maintenance_movements(public_id,cost_center_id,financial_transaction_id,amount,movement_date,created_by)
      VALUES($1,$2,$3,100,$4,$5)`, [crypto.randomUUID(),source.id,receipt.id,date,user.id]);
  });
  assert.equal((await balance(db,source.id)).saldo,700);
  const pack = await buildPackage();
  await closeDatabase();

  process.env.PGLITE_DATA_DIR = path.join(temp, 'destino');
  await initializeDatabase();
  db = getDb();
  // As categorias padrão são semeadas com IDs locais; a instalação de destino
  // fica vazia para verificar a importação integral do pacote de origem.
  await db.query('DELETE FROM categories');
  const imported = await importPackage({ content:JSON.stringify(pack), filename:'contratos.ccsync', user });
  assert.equal(imported.ok,true);
  const cloned = (await db.query('SELECT id FROM cost_centers WHERE public_id=$1', [source.public_id])).rows[0];
  assert.ok(cloned);
  assert.equal((await balance(db,cloned.id)).saldo,700);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM maintenance_movements WHERE cost_center_id=$1', [cloned.id])).rows[0].n,2);
  assert.equal((await importPackage({ content:JSON.stringify(pack), filename:'contratos.ccsync', user })).duplicado,true);
  const collision = structuredClone(pack);
  collision.payload.costCenters.find((c) => c.publicId === source.public_id).publicId = crypto.randomUUID();
  process.env.SYNC_API_URL = 'https://cloud.test';
  global.fetch = async () => new Response(JSON.stringify({ snapshot:collision }), { status:200,headers:{ 'Content-Type':'application/json' } });
  const cloud = require('../services/cloudSync');
  await assert.rejects(cloud.pullNow({ ...user,email:'teste@rcconstrutec.com.br',cloud_session_token:'teste' }), /identifica contratos diferentes/);
  assert.ok((await db.query('SELECT 1 FROM cost_centers WHERE public_id=$1', [source.public_id])).rows.length);
});
