const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

let database;
let instanceIdentity;
let restoreApplied = null;
let localLockPath = null;

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireLocalDatabaseLock(dataDir) {
  const lockPath = `${dataDir}.centro-custos.lock`;
  if (fs.existsSync(lockPath)) {
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {}
    if (processIsAlive(Number(owner?.pid))) {
      throw new Error('O banco local já está em uso por outro processo do Centro de Custos.');
    }
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, JSON.stringify({ pid:process.pid, startedAt:new Date().toISOString() }), { flag:'wx' });
  localLockPath = lockPath;
  const internalLock = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(internalLock)) fs.unlinkSync(internalLock);
}

function releaseLocalDatabaseLock() {
  if (!localLockPath) return;
  try {
    if (fs.existsSync(localLockPath)) {
      const owner = JSON.parse(fs.readFileSync(localLockPath, 'utf8'));
      if (Number(owner.pid) === process.pid) fs.unlinkSync(localLockPath);
    }
  } catch (error) {
    console.error('Não foi possível liberar a trava do banco local:', error.message);
  }
  localLockPath = null;
}

function restoreRootDir() {
  return path.resolve(process.env.RESTORE_ROOT_DIR || path.join(__dirname, 'dados'));
}

function pendingRestorePath() {
  return path.join(restoreRootDir(), 'restauracao-pendente.json');
}

function prepareRestore(dataDir) {
  const markerPath = pendingRestorePath();
  if (!fs.existsSync(markerPath)) return null;
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const archivePath = path.resolve(String(marker.archivePath || ''));
  const allowedDir = path.join(restoreRootDir(), 'restauracoes');
  if (!archivePath.startsWith(allowedDir + path.sep) || !fs.existsSync(archivePath)) {
    throw new Error('O arquivo da restauração agendada não foi encontrado ou não é seguro.');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyDir = `${dataDir}-antes-restauracao-${stamp}`;
  if (fs.existsSync(dataDir)) fs.renameSync(dataDir, safetyDir);
  return { markerPath, archivePath, safetyDir, stamp, blob: new Blob([fs.readFileSync(archivePath)]) };
}

function rollbackRestore(dataDir, restore, error) {
  try {
    if (fs.existsSync(dataDir)) fs.renameSync(dataDir, `${dataDir}-restauracao-falhou-${restore.stamp}`);
    if (fs.existsSync(restore.safetyDir)) fs.renameSync(restore.safetyDir, dataDir);
    fs.renameSync(restore.markerPath, `${restore.markerPath}.falhou-${restore.stamp}.json`);
  } catch (rollbackError) {
    console.error('Falha ao reverter a restauração:', rollbackError);
  }
  throw error;
}

async function createDatabase() {
  if (process.env.DATABASE_URL) {
    const { Pool, types } = require('pg');
    types.setTypeParser(20, Number);
    types.setTypeParser(1700, Number);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    return {
      mode: 'postgres',
      query: (...args) => pool.query(...args),
      exec: (sql) => pool.query(sql),
      transaction: async (callback) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await callback(normalizeClient(client));
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = path.resolve(process.env.PGLITE_DATA_DIR || path.join(__dirname, 'dados', 'pglite'));
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  acquireLocalDatabaseLock(dataDir);
  const restore = prepareRestore(dataDir);
  let pglite;
  try {
    pglite = await PGlite.create(dataDir, restore ? { loadDataDir: restore.blob } : undefined);
    if (restore) {
      restoreApplied = { archivePath: restore.archivePath, safetyDir: restore.safetyDir };
      fs.unlinkSync(restore.markerPath);
      console.log(`Backup restaurado. A base anterior foi preservada em ${restore.safetyDir}`);
    }
  } catch (error) {
    releaseLocalDatabaseLock();
    if (restore) rollbackRestore(dataDir, restore, error);
    throw error;
  }
  return {
    mode: 'pglite',
    query: async (...args) => normalizeResult(await pglite.query(...args)),
    exec: (...args) => pglite.exec(...args),
    transaction: (callback) => pglite.transaction(async (tx) => callback(normalizeClient(tx))),
    close: async () => { try { await pglite.close(); } finally { releaseLocalDatabaseLock(); } },
    dump: () => pglite.dumpDataDir(),
    dataDir,
  };
}

function normalizeClient(client) {
  return {
    query: async (...args) => normalizeResult(await client.query(...args)),
    exec: (...args) => client.exec ? client.exec(...args) : client.query(...args),
  };
}

function normalizeResult(result) {
  if (result.rowCount == null) result.rowCount = result.affectedRows || 0;
  return result;
}

function getDb() {
  if (!database) throw new Error('Banco de dados ainda não inicializado.');
  return database;
}

function getInstanceIdentity() {
  if (!instanceIdentity) throw new Error('Identidade da instalação ainda não inicializada.');
  return instanceIdentity;
}

async function runMigrations() {
  const db = getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const applied = new Set(
    (await db.query('SELECT filename FROM schema_migrations')).rows.map((row) => row.filename)
  );
  const directory = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = fs.readFileSync(path.join(directory, filename), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    });
    console.log(`Migração aplicada: ${filename}`);
  }
}

async function ensureInstance() {
  const db = getDb();
  const configuredName = String(process.env.INSTANCE_NAME || '').trim();
  const existing = await db.query("SELECT value FROM app_settings WHERE key = 'instance_id'");
  let id = existing.rows[0]?.value;
  if (!id) {
    id = crypto.randomUUID();
    await db.query("INSERT INTO app_settings (key, value) VALUES ('instance_id', $1)", [id]);
  }

  const nameResult = await db.query("SELECT value FROM app_settings WHERE key = 'instance_name'");
  let name = configuredName || nameResult.rows[0]?.value;
  if (!name) name = `Instalação ${id.slice(0, 8)}`;
  if (!nameResult.rows[0]) {
    await db.query("INSERT INTO app_settings (key, value) VALUES ('instance_name', $1)", [name]);
  } else if (configuredName && configuredName !== nameResult.rows[0].value) {
    await db.query("UPDATE app_settings SET value = $1 WHERE key = 'instance_name'", [configuredName]);
  }
  instanceIdentity = { id, name };
}

async function ensureInitialAdmin() {
  const db = getDb();
  const count = await db.query('SELECT COUNT(*)::int AS total FROM users');
  if (count.rows[0].total > 0) return;
  const email = String(process.env.ADMIN_INITIAL_EMAIL || 'admin@empresa.com').trim().toLowerCase();
  const name = String(process.env.ADMIN_INITIAL_NAME || 'Administrador').trim();
  const password = String(process.env.ADMIN_INITIAL_PASSWORD || '');
  if (password.length < 10) {
    throw new Error('Defina ADMIN_INITIAL_PASSWORD com pelo menos 10 caracteres no arquivo .env.');
  }
  await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')`,
    [name, email, await bcrypt.hash(password, 12)]
  );
  console.log(`Administrador inicial criado: ${email}. Troque a senha após o primeiro acesso.`);
}

async function initializeDatabase() {
  database = await createDatabase();
  try {
    await runMigrations();
    await ensureInstance();
    await ensureInitialAdmin();
    if (restoreApplied) {
      await database.query(
        `INSERT INTO audit_log (entity_type,action,summary,data,user_name,instance_id,instance_name)
         VALUES ('backup','restaurado','Backup restaurado com cópia preventiva da base anterior.',$1::jsonb,'Sistema',$2,$3)`,
        [JSON.stringify(restoreApplied),instanceIdentity.id,instanceIdentity.name]
      );
    }
    await database.query('SELECT 1');
    return { mode: database.mode, dataDir: database.dataDir, instance: instanceIdentity };
  } catch (error) {
    await closeDatabase();
    throw error;
  }
}

async function closeDatabase() {
  if (database) await database.close();
  database = null;
  instanceIdentity = null;
  restoreApplied = null;
}

module.exports = { getDb, getInstanceIdentity, initializeDatabase, closeDatabase };



