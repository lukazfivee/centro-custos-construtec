const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, getInstanceIdentity } = require('../db');
const logger = require('../lib/logger');

let timer = null;
let running = false;
let lastDate = null;

function rootDir() {
  return path.resolve(process.env.RESTORE_ROOT_DIR || path.join(__dirname, '..', 'dados'));
}
function backupDir() { return path.join(rootDir(), 'backups-automaticos'); }

async function readConfig() {
  const { rows } = await getDb().query("SELECT key,value FROM app_settings WHERE key IN ('auto_backup_enabled','auto_backup_hour','auto_backup_retention')");
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    enabled: cfg.auto_backup_enabled === 'true',
    hour: Number(cfg.auto_backup_hour || 19),
    retention: Number(cfg.auto_backup_retention || 30),
  };
}

async function createAutomaticBackup() {
  if (running) return null;
  const db = getDb();
  if (!db.dump) return null;
  running = true;
  try {
    fs.mkdirSync(backupDir(), { recursive:true });
    const dump = await db.dump();
    const buffer = Buffer.from(await dump.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const date = new Date();
    const stamp = date.toISOString().replace(/[:.]/g, '-');
    const instance = getInstanceIdentity();
    const safeName = instance.name.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
    const filename = `backup-auto-${safeName}-${stamp}.tar.gz`;
    const filePath = path.join(backupDir(), filename);
    fs.writeFileSync(filePath, buffer, { flag:'wx' });
    fs.writeFileSync(`${filePath}.sha256`, `${sha256}  ${filename}\n`, { flag:'wx' });
    await getDb().query(
      `INSERT INTO audit_log (entity_type,action,summary,data,user_name,instance_id,instance_name)
       VALUES ('backup','automatico','Backup automático local criado e verificado.',$1::jsonb,'Sistema',$2,$3)`,
      [JSON.stringify({filename,bytes:buffer.length,sha256}),instance.id,instance.name]
    );
    logger.info('automatic_backup_created', { filename, bytes:buffer.length, sha256 });
    return { filename, bytes:buffer.length, sha256 };
  } finally { running = false; }
}

function cleanup(retention) {
  if (!fs.existsSync(backupDir())) return;
  const entries = fs.readdirSync(backupDir(), { withFileTypes:true })
    .filter((e) => e.isFile() && /^backup-auto-.*\.tar\.gz$/.test(e.name))
    .map((e) => ({ name:e.name, path:path.join(backupDir(),e.name), mtime:fs.statSync(path.join(backupDir(),e.name)).mtimeMs }))
    .sort((a,b) => b.mtime-a.mtime);
  entries.slice(Math.max(3, retention)).forEach((entry) => {
    try { fs.unlinkSync(entry.path); } catch {}
    try { fs.unlinkSync(`${entry.path}.sha256`); } catch {}
  });
}

async function tick() {
  try {
    const cfg = await readConfig();
    if (!cfg.enabled) return;
    const now = new Date();
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone:process.env.APP_TIMEZONE || 'America/Sao_Paulo' }).format(now);
    const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', hour12:false, timeZone:process.env.APP_TIMEZONE || 'America/Sao_Paulo' }).format(now));
    if (hour !== cfg.hour || lastDate === dateKey) return;
    await createAutomaticBackup();
    cleanup(cfg.retention);
    lastDate = dateKey;
  } catch (error) {
    logger.error('automatic_backup_failed', { error });
  }
}

function startAutoBackupScheduler() {
  if (timer) return;
  timer = setInterval(tick, 60 * 1000);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
  logger.info('automatic_backup_scheduler_started');
}
function stopAutoBackupScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startAutoBackupScheduler, stopAutoBackupScheduler, createAutomaticBackup };
