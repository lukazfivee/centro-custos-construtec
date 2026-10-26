const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..');
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const INSTANCE = '33333333-3333-4333-8333-333333333333';

// D1 de mentira sobre node:sqlite, so com o que o Worker usa.
function fakeD1(sql) {
  const db = new DatabaseSync(':memory:');
  db.exec(sql);
  return {
    prepare(text) {
      let params = [];
      const stmt = {
        bind(...args) { params = args; return stmt; },
        async first() { return db.prepare(text).get(...params) ?? null; },
        async all() { return { results: db.prepare(text).all(...params) }; },
        async run() { db.prepare(text).run(...params); return { success: true }; },
      };
      return stmt;
    },
  };
}

async function loadWorker() {
  const source = fs.readFileSync(path.join(root, 'cloudflare-sync-worker', 'src', 'index.js'), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function obra(publicId, updatedAt) {
  return { publicId, code: `C-${publicId.slice(0, 4)}`, name: `Obra ${publicId.slice(0, 4)}`, revision: 1, active: true, createdAt: updatedAt, updatedAt };
}

test('Worker: exclusão feita em uma instalação some do snapshot e não é recriada por pacote antigo', async () => {
  const worker = (await loadWorker()).default;
  const env = { DB: fakeD1(fs.readFileSync(path.join(root, 'cloudflare-sync-worker', 'schema.sql'), 'utf8')), SYNC_SHARED_KEY: 'chave-de-teste' };
  const sync = async (payload) => {
    const response = await worker.fetch(new Request('https://sync.test/v1/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': 'chave-de-teste', 'x-instance-id': INSTANCE, 'x-user-email': 'teste@rcconstrutec.com.br' },
      body: JSON.stringify({ formatVersion: 3, payload: { categories: [], costCenters: [], suppliers: [], transactions: [], ...payload } }),
    }), env);
    assert.equal(response.status, 200);
    return response.json();
  };

  const antes = await sync({ costCenters: [obra(UUID_A, '2026-01-01T00:00:00Z'), obra(UUID_B, '2026-01-01T00:00:00Z')] });
  assert.deepEqual(antes.snapshot.payload.costCenters.map((c) => c.publicId).sort(), [UUID_A, UUID_B]);
  assert.deepEqual(antes.snapshot.payload.deletedCostCenters, []);

  const excluido = await sync({ costCenters: [obra(UUID_B, '2026-01-01T00:00:00Z')], deletedCostCenters: [UUID_A] });
  assert.deepEqual(excluido.snapshot.payload.costCenters.map((c) => c.publicId), [UUID_B]);
  assert.deepEqual(excluido.snapshot.payload.deletedCostCenters, [UUID_A]);

  // Instalacao antiga ainda tem a obra e a envia de novo: continua excluida.
  const antigo = await sync({ costCenters: [obra(UUID_A, '2026-01-01T00:00:00Z'), obra(UUID_B, '2026-01-01T00:00:00Z')] });
  assert.deepEqual(antigo.snapshot.payload.costCenters.map((c) => c.publicId), [UUID_B]);
  assert.ok(antigo.results.some((r) => r.publicId === UUID_A && r.action === 'deleted'));

  // Obra restaurada (alteracao posterior a exclusao) reabre o centro.
  const restaurado = await sync({ costCenters: [obra(UUID_A, new Date(Date.now() + 60000).toISOString())] });
  assert.ok(restaurado.snapshot.payload.costCenters.some((c) => c.publicId === UUID_A));
  assert.deepEqual(restaurado.snapshot.payload.deletedCostCenters, []);
});

test('Centro: pacote leva as exclusões e a importação apaga o centro vazio, sem recriá-lo', async (context) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-prop-'));
  process.env.PGLITE_DATA_DIR = path.join(dir, 'database');
  process.env.RESTORE_ROOT_DIR = path.join(dir, 'restore');
  process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.ADMIN_INITIAL_PASSWORD = 'senha-teste-123';
  process.env.ADMIN_INITIAL_EMAIL = 'admin@teste.local';
  delete process.env.DATABASE_URL;
  const { initializeDatabase, closeDatabase, getDb, getInstanceIdentity } = require('../db');
  await initializeDatabase();
  context.after(async () => { await closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }); });
  const db = getDb();
  const { buildPackage, importPackage, stableHash } = require('../services/smartSync');
  const admin = (await db.query("SELECT id FROM users WHERE email='admin@teste.local'")).rows[0];
  const user = { id: admin.id, name: 'Administrador' };

  const novoPacote = async (payload) => {
    const base = await buildPackage();
    const merged = { ...base.payload, ...payload };
    return { ...base, packageId: require('crypto').randomUUID(), payload: merged, payloadHash: stableHash(merged) };
  };
  const importar = (pack) => importPackage({ content: JSON.stringify(pack), filename: 'teste.ccsync', user });

  const livre = (await db.query("INSERT INTO cost_centers (public_id,code,name) VALUES ($1,'LIVRE','Livre') RETURNING id", [UUID_A])).rows[0];
  const comMovimento = (await db.query("INSERT INTO cost_centers (public_id,code,name) VALUES ($1,'MOV','Com movimento') RETURNING id", [UUID_B])).rows[0];
  const category = (await db.query('SELECT id FROM categories LIMIT 1')).rows[0].id;
  await db.query(`INSERT INTO transactions (origin_instance_id,origin_instance_name,last_modified_instance_id,last_modified_instance_name,origin_user_name,public_id,type,description,amount,transaction_date,cost_center_id,category_id,created_by)
    VALUES ($4,'T',$4,'T','T',gen_random_uuid(),'despesa','x',10,'2026-01-01',$1,$2,$3)`, [comMovimento.id, category, user.id, getInstanceIdentity().id]);

  // 1) A exclusao feita aqui entra no pacote.
  await db.query('INSERT INTO cost_center_tombstones (public_id) VALUES ($1)', ['44444444-4444-4444-8444-444444444444']);
  assert.ok((await buildPackage()).payload.deletedCostCenters.includes('44444444-4444-4444-8444-444444444444'));

  // 2) Importar a exclusao remove o centro vazio, grava a lapide e nao recria o centro que veio no mesmo pacote.
  const resultado = await importar(await novoPacote({
    costCenters: [obra(UUID_A, '2026-01-01T00:00:00Z')],
    deletedCostCenters: [UUID_A, UUID_B],
  }));
  assert.equal(resultado.resumo.excluidos, 1);
  assert.equal((await db.query('SELECT 1 FROM cost_centers WHERE public_id=$1', [UUID_A])).rows.length, 0);
  assert.equal((await db.query('SELECT 1 FROM cost_center_tombstones WHERE public_id=$1', [UUID_A])).rows.length, 1);

  // 3) Centro com movimento fica e vira conflito, sem lapide.
  assert.equal((await db.query('SELECT 1 FROM cost_centers WHERE id=$1', [comMovimento.id])).rows.length, 1);
  assert.equal((await db.query('SELECT 1 FROM cost_center_tombstones WHERE public_id=$1', [UUID_B])).rows.length, 0);
  assert.equal(resultado.resumo.porTipo.obra.conflitos, 1);
  void livre;
});
