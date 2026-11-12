// Banco D1 falso (SQLite em memoria) e cliente de chamadas para os testes do diretorio central.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let sqlite = null;
try { sqlite = require('node:sqlite'); } catch { sqlite = null; }

const root = path.join(__dirname, '..', '..');
const LEGACY_SCHEMA = `
CREATE TABLE sync_rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL);
CREATE TABLE cloud_users (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
  password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_iterations INTEGER NOT NULL DEFAULT 10000,
  role TEXT NOT NULL CHECK (role IN ('admin','gestor','supervisor')), active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT,
  profile_photo_base64 TEXT, profile_photo_mime TEXT
);
CREATE UNIQUE INDEX cloud_users_email_unique ON cloud_users(org_id, email);
CREATE TABLE cloud_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, org_id TEXT NOT NULL, instance_id TEXT, instance_name TEXT,
  created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen_at TEXT NOT NULL
);`;

// Adaptador minimo com a mesma interface do binding D1 usada pelo Worker.
function fakeD1() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(LEGACY_SCHEMA);
  for (const name of ['006-identidade-compartilhada.sql', '007-mobile-auth.sql', '008-sessao-web-vinculada.sql', '009-handoff-alvo.sql', '010-notificacoes.sql', '011-cadastro.sql', '012-papeis-suite.sql', '014-dev-ferramentas.sql']) {
    db.exec(fs.readFileSync(path.join(root, 'cloudflare', 'center-container', 'd1-migrations', name), 'utf8'));
  }
  const statement = (sql) => ({
    args: [],
    bind(...args) { this.args = args; return this; },
    async first() { return db.prepare(sql).get(...this.args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...this.args) }; },
    async run() { const r = db.prepare(sql).run(...this.args); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    raw: db,
    prepare: statement,
    async batch(list) {
      db.exec('BEGIN');
      // Como o D1 real, devolve o resultado de cada comando.
      try { const out = []; for (const item of list) out.push(await item.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const SERVICE_KEY = 's'.repeat(40);
const SYNC_KEY = 'b'.repeat(40);

async function setup() {
  const auth = await import(pathToFileURL(path.join(root, 'cloudflare', 'center-container', 'centralAuth.js')).href);
  const env = { DB: fakeD1(), CONSTRUTEC_IDENTITY_KEY: SERVICE_KEY, SYNC_SHARED_KEY: SYNC_KEY };
  const call = async (method, pathname, { body, token, service, ip = '203.0.113.9' } = {}) => {
    const headers = { 'content-type': 'application/json', 'cf-connecting-ip': ip };
    if (token) headers.authorization = `Bearer ${token}`;
    if (service) { headers['x-construtec-identity-key'] = service; headers['x-construtec-client-ip'] = '198.51.100.7'; }
    if (pathname === '/v1/auth/bootstrap') headers['x-sync-key'] = SYNC_KEY;
    const request = new Request(`https://centro.test${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const response = await auth.handleCentralAuth(request, env);
    return { status: response.status, data: await response.json() };
  };
  await call('POST', '/v1/auth/bootstrap', { body: { name: 'Admin', email: 'admin@rcconstrutec.com.br', password: 'senha-admin-123' } });
  const admin = (await call('POST', '/v1/auth/login', { body: { email: 'admin@rcconstrutec.com.br', password: 'senha-admin-123' } })).data;
  return { env, call, adminToken: admin.sessionToken };
}


module.exports = { sqlite, setup, SERVICE_KEY, SYNC_KEY };
