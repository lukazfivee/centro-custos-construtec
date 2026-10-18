const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { spawn } = childProcess;
const { once } = require('events');

test('lock local distingue processo ativo de PID reutilizado', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'centro-custos-lock-'));
  const dataDir = path.join(root, 'pglite');
  const lockPath = `${dataDir}.centro-custos.lock`;
  const envNames = ['PGLITE_DATA_DIR', 'RESTORE_ROOT_DIR', 'ADMIN_INITIAL_NAME', 'ADMIN_INITIAL_EMAIL', 'ADMIN_INITIAL_PASSWORD'];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.PGLITE_DATA_DIR = dataDir;
  process.env.RESTORE_ROOT_DIR = path.join(root, 'dados');
  process.env.ADMIN_INITIAL_NAME = 'Administrador';
  process.env.ADMIN_INITIAL_EMAIL = 'admin-lock@teste.local';
  process.env.ADMIN_INITIAL_PASSWORD = 'SenhaSegura123!';

  let db;
  const unrelated = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/q', '/c', 'pause >nul'], { stdio:['pipe', 'ignore', 'ignore'], windowsHide:true })
    : spawn('sh', ['-c', 'read value'], { stdio:['pipe', 'ignore', 'ignore'] });
  await once(unrelated, 'spawn');
  t.after(async () => {
    unrelated.kill();
    if (db) await db.closeDatabase();
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(root, { recursive:true, force:true });
  });

  // Keep the real PID alive, but make its OS listing independent of machine load.
  // db.js captures execFileSync on import, so install the scoped fixture first.
  const lookupCommand = process.platform === 'win32' ? 'tasklist.exe' : 'ps';
  const lookupArgs = process.platform === 'win32'
    ? ['/FI', `PID eq ${unrelated.pid}`, '/FO', 'CSV', '/NH']
    : ['-o', 'comm=', '-p', String(unrelated.pid)];
  const listing = process.platform === 'win32'
    ? `"cmd.exe","${unrelated.pid}","Console","1","1 K"\r\n`
    : 'sh\n';
  const nativeExecFileSync = childProcess.execFileSync;
  let lookupAvailable = true;
  const lookupCalls = [];
  t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
    if (command !== lookupCommand || JSON.stringify(args) !== JSON.stringify(lookupArgs)) {
      return nativeExecFileSync(command, args, options);
    }
    lookupCalls.push({ command, args });
    if (!lookupAvailable) throw Object.assign(new Error('Process lookup timed out'), { code:'ETIMEDOUT' });
    return listing;
  });
  db = require('../db');

  const staleOwner = { pid:unrelated.pid, startedAt:'2000-01-01T00:00:00.000Z' };
  fs.writeFileSync(lockPath, JSON.stringify(staleOwner));
  const info = await db.initializeDatabase();
  assert.equal(info.mode, 'pglite');
  assert.equal(lookupCalls.length, 1);
  await db.closeDatabase();

  // An unavailable lookup must retain the lock, rather than assume a stale PID.
  lookupAvailable = false;
  fs.writeFileSync(lockPath, JSON.stringify(staleOwner));
  await assert.rejects(db.initializeDatabase(), /banco local já está em uso/i);
  assert.equal(lookupCalls.length, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')), staleOwner);
  lookupAvailable = true;

  fs.writeFileSync(lockPath, JSON.stringify({
    pid:process.pid,
    executable:path.basename(process.execPath),
    processStartedAt:new Date(Date.now() - process.uptime() * 1000).toISOString(),
    startedAt:new Date().toISOString(),
  }));
  await assert.rejects(db.initializeDatabase(), /banco local já está em uso/i);
});
