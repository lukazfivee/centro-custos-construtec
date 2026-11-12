// Ponta a ponta: o desktop (banco local + cloudSync.syncNow por HTTP real) conversa com o Worker de producao
// (center-container sobre D1 de mentira) e outra instalacao entra pelo proprio Worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
// node:sqlite so existe a partir do Node 22.13 sem flag; no Node 22 mais antigo o teste e pulado.
let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch {}

const root = path.join(__dirname, '..');
const KEY = 'chave-de-teste-com-mais-de-trinta-e-dois-caracteres';
const OUTRA_INSTALACAO = '55555555-5555-4555-8555-555555555555';
const X = '11111111-1111-4111-8111-111111111111';
const Y = '22222222-2222-4222-8222-222222222222';

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
    async batch(statements) { for (const s of statements) await s.run(); return []; },
  };
}

const obra = (publicId, code, updatedAt) => ({ publicId, code, name: `Obra ${code}`, revision: 1, active: true, createdAt: updatedAt, updatedAt });

test('desktop e nuvem: excluir em um lado remove no outro, sem recriar com pacote antigo', { skip: !DatabaseSync && 'node:sqlite indisponível' }, async (context) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-e2e-sync-'));
  process.env.PGLITE_DATA_DIR = path.join(dir, 'database');
  process.env.RESTORE_ROOT_DIR = path.join(dir, 'restore');
  process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.ADMIN_INITIAL_PASSWORD = 'senha-teste-123';
  process.env.ADMIN_INITIAL_EMAIL = 'admin@teste.local';
  process.env.SYNC_SHARED_KEY = KEY;
  delete process.env.DATABASE_URL;

  const { handleCommercialSync } = await import(pathToFileURL(path.join(root, 'cloudflare', 'center-container', 'commercialSync.js')).href);
  const env = { DB: fakeD1(fs.readFileSync(path.join(root, 'cloudflare-sync-worker', 'schema.sql'), 'utf8')), SYNC_SHARED_KEY: KEY };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const response = await handleCommercialSync(new Request(`http://worker.test${req.url}`, {
      method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    }), env);
    res.writeHead(response.status, { 'content-type': 'application/json' });
    res.end(await response.text());
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  process.env.SYNC_API_URL = `http://127.0.0.1:${server.address().port}`;

  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  await initializeDatabase();
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const db = getDb();
  const cloud = require('../services/cloudSync');
  const { discardCostCenter } = require('../services/costCenterArchive');
  const admin = (await db.query("SELECT id,name,email FROM users WHERE email='admin@teste.local'")).rows[0];
  const desktopUser = { id: admin.id, name: admin.name, email: 'desktop@rcconstrutec.com.br' };

  // A outra instalacao fala direto com o Worker.
  const outra = async (payload) => {
    const response = await fetch(`${process.env.SYNC_API_URL}/v1/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': KEY, 'x-instance-id': OUTRA_INSTALACAO, 'x-user-email': 'outra@rcconstrutec.com.br' },
      body: JSON.stringify({ formatVersion: 3, payload: { categories: [], costCenters: [], suppliers: [], transactions: [], ...payload } }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const noDesktop = async (publicId) => (await db.query('SELECT 1 FROM cost_centers WHERE public_id=$1', [publicId])).rows.length === 1;
  const naNuvem = async () => (await outra({})).snapshot.payload;

  // 1) Obra criada na outra instalacao chega ao desktop.
  await outra({ costCenters: [obra(X, 'E2E-X', '2026-10-01T00:00:00.000Z')] });
  await cloud.syncNow(desktopUser);
  assert.equal(await noDesktop(X), true);

  // 2) Obra criada no desktop chega a nuvem e, descartada no desktop, sai da nuvem.
  await db.query("INSERT INTO cost_centers (public_id,code,name) VALUES ($1,'E2E-Y','Obra Y')", [Y]);
  await cloud.syncNow(desktopUser);
  assert.ok((await naNuvem()).costCenters.some((c) => c.publicId === Y));
  const idY = (await db.query('SELECT id FROM cost_centers WHERE public_id=$1', [Y])).rows[0].id;
  await discardCostCenter(db, idY, desktopUser, 'teste ponta a ponta');
  await cloud.syncNow(desktopUser);
  let nuvem = await naNuvem();
  assert.equal(nuvem.costCenters.some((c) => c.publicId === Y), false);
  assert.ok(nuvem.deletedCostCenters.includes(Y));

  // 3) Obra excluida na outra instalacao some do desktop.
  await outra({ deletedCostCenters: [X] });
  await cloud.syncNow(desktopUser);
  assert.equal(await noDesktop(X), false);

  // 4) Pacote antigo da outra instalacao nao recria nenhuma das duas, nem na nuvem nem no desktop.
  await outra({ costCenters: [obra(X, 'E2E-X', '2026-10-01T00:00:00.000Z'), obra(Y, 'E2E-Y', '2026-10-01T00:00:00.000Z')] });
  await cloud.syncNow(desktopUser);
  nuvem = await naNuvem();
  assert.deepEqual(nuvem.costCenters.filter((c) => [X, Y].includes(c.publicId)), []);
  assert.equal(await noDesktop(X), false);
  assert.equal(await noDesktop(Y), false);
});
