const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = path.join(os.tmpdir(), `centro-dev-vercomo-${process.pid}`);
process.env.PGLITE_DATA_DIR = dataDir;
process.env.RESTORE_ROOT_DIR = `${dataDir}-restore`;
process.env.JWT_SECRET = 'jwt-dev-vercomo-test-secret-with-thirty-two-chars';
process.env.ADMIN_INITIAL_EMAIL = 'admin@teste.local';
process.env.ADMIN_INITIAL_PASSWORD = 'AdminSenha123!';
delete process.env.DATABASE_URL;

const jwt = require('jsonwebtoken');
const { initializeDatabase, closeDatabase, getDb } = require('../db');
const { setup, hasSQLite } = require('./password-reset-fixture.test');
const { resetPermissionsCache } = require('../services/permissions');
const maybe = hasSQLite ? test : test.skip;

// Centro de ponta a ponta com o Worker central de verdade: ferramentas de dev e "ver como".
maybe('dev: auditoria, sessoes, desbloqueio e ver como pela API do Centro', async (t) => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  await initializeDatabase();
  process.env.DATABASE_URL = 'postgres://dev-vercomo-test';
  process.env.SYNC_API_URL = 'https://centro.test';
  const { env, call, token: workerToken } = await setup();
  process.env.SYNC_SHARED_KEY = env.SYNC_SHARED_KEY;
  const nativeFetch = global.fetch;
  const auth = await import('../cloudflare/center-container/centralAuth.js');
  global.fetch = (input, options) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://centro.test/v1/')) return auth.handleCentralAuth(new Request(url, options), env);
    return nativeFetch(input, options);
  };
  const { createApp } = require('../server');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    global.fetch = nativeFetch;
    delete process.env.DATABASE_URL; delete process.env.SYNC_SHARED_KEY; delete process.env.SYNC_API_URL;
    resetPermissionsCache();
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // O admin do fixture vira dev no Worker e no espelho local.
  const adminId = env.DB.raw.prepare("SELECT id FROM cloud_users WHERE role='admin'").get().id;
  env.DB.raw.prepare("UPDATE cloud_users SET suite_role='dev',email='pcm@rcconstrutec.com.br' WHERE id=?").run(adminId);
  const db = getDb();
  await db.query("UPDATE users SET email='pcm@rcconstrutec.com.br',suite_role='dev',cloud_managed=TRUE,cloud_user_id=$1,cloud_session_token=$2 WHERE email='admin@teste.local'", [adminId, workerToken]);
  const localDev = (await db.query("SELECT id FROM users WHERE email='pcm@rcconstrutec.com.br'")).rows[0].id;
  const devJwt = jwt.sign({}, process.env.JWT_SECRET, { subject: String(localDev), expiresIn: '1h' });
  const api = async (method, route, body, token = devJwt) => {
    const response = await nativeFetch(base + route, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };

  const fulano = { name: 'Fulano', email: 'fulano@rcconstrutec.com.br', password: 'senha-fulano-12', role: 'gestor' };
  assert.equal((await call('POST', '/v1/users', { token: workerToken, body: fulano })).status, 201);

  // Sessoes e desbloqueio.
  const sessoes = await api('GET', '/dev/sessoes');
  assert.equal(sessoes.status, 200);
  assert.ok(sessoes.data.sessions.some((s) => s.email === 'pcm@rcconstrutec.com.br' && s.current));
  assert.equal((await api('POST', '/dev/usuarios/desbloquear', { email: fulano.email })).status, 200);
  assert.equal((await api('POST', '/dev/sessoes/derrubar', {})).status, 400);

  // Ver como: JWT curto na pele do Fulano, marcado com o dev.
  const aberto = await api('POST', '/dev/ver-como', { email: fulano.email });
  assert.equal(aberto.status, 200, JSON.stringify(aberto.data));
  assert.equal(aberto.data.usuario.email, fulano.email);
  assert.equal(aberto.data.verComo, 'pcm@rcconstrutec.com.br');
  const ttl = jwt.decode(aberto.data.token).exp - jwt.decode(aberto.data.token).iat;
  assert.equal(ttl, 30 * 60);
  const asFulano = aberto.data.token;
  const eu = await api('GET', '/auth/me', undefined, asFulano);
  assert.equal(eu.status, 200);
  assert.equal(eu.data.email, fulano.email);
  assert.equal(eu.data.verComo, 'pcm@rcconstrutec.com.br');
  assert.equal(eu.data.programador, false);
  assert.equal((await api('GET', '/auth/me')).data.verComo, null);

  // Na pele de outro nao ha ferramenta de dev, nem outro ver como.
  assert.equal((await api('GET', '/dev/auditoria', undefined, asFulano)).status, 403);
  assert.equal((await api('POST', '/dev/ver-como', { email: 'pcm@rcconstrutec.com.br' }, asFulano)).status, 403);

  // Quem nao e dev nao usa nada.
  const fulanoLogin = await call('POST', '/v1/auth/login', { body: { email: fulano.email, password: fulano.password } });
  const fulanoLocal = (await db.query("SELECT id FROM users WHERE email=$1", [fulano.email])).rows[0].id;
  await db.query('UPDATE users SET cloud_session_token=$1 WHERE id=$2', [fulanoLogin.data.sessionToken, fulanoLocal]);
  const fulanoJwt = jwt.sign({}, process.env.JWT_SECRET, { subject: String(fulanoLocal), expiresIn: '1h' });
  assert.equal((await api('GET', '/dev/auditoria', undefined, fulanoJwt)).status, 403);

  // Encerrar: a sessao do ver como cai; o dev segue com a dele.
  assert.equal((await api('POST', '/dev/ver-como/fim', {})).status, 400);
  assert.equal((await api('POST', '/dev/ver-como/fim', {}, asFulano)).status, 200);
  assert.equal((await api('GET', '/auth/me', undefined, asFulano)).status, 401);
  assert.equal((await api('GET', '/auth/me')).status, 200);

  const audit = await api('GET', '/dev/auditoria');
  assert.equal(audit.status, 200);
  assert.deepEqual(audit.data.entries.map((e) => e.action).reverse(), ['login_desbloqueado', 'ver_como_inicio', 'ver_como_fim']);
});
