const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { setup, hasSQLite } = require('./password-reset-fixture.test');
const maybe = hasSQLite ? test : test.skip;
const worker = (file) => pathToFileURL(path.join(__dirname, '..', 'cloudflare', 'center-container', file)).href;

maybe('Worker recusa consultas e sincronização financeira de técnico canônico ou legado', async () => {
  const { env, email, token } = await setup();
  const { handleCommercialSync } = await import(worker('commercialSync.js'));
  for (const suiteRole of ['tecnico', null]) {
    env.DB.raw.prepare("UPDATE cloud_users SET role='supervisor',suite_role=? WHERE email=?").run(suiteRole, email);
    for (const [method, route] of [['GET','/v1/clients'], ['GET','/v1/client-followups'], ['GET','/v1/client-email-draft'],
      ['GET','/v1/activity'], ['GET','/v1/sync/snapshot'], ['POST','/v1/sync'], ['POST','/v1/clients']]) {
      const response = await handleCommercialSync(new Request(`https://centro.test${route}`, {
        method, headers: { Authorization: `Bearer ${token}` },
      }), env);
      assert.equal(response.status, 403, `${suiteRole}: ${method} ${route}`);
    }
  }
  env.DB.raw.prepare("UPDATE cloud_users SET suite_role='engenharia' WHERE email=?").run(email);
  assert.equal((await handleCommercialSync(new Request('https://centro.test/v1/clients', { headers: { Authorization: `Bearer ${token}` } }), env)).status, 200);
});

maybe('Worker bloqueia histórico de avisos do técnico inclusive pela ponte interna', async () => {
  const { env, email, token } = await setup();
  env.DB.raw.prepare("UPDATE cloud_users SET suite_role='tecnico' WHERE email=?").run(email);
  const userId = env.DB.raw.prepare('SELECT id FROM cloud_users WHERE email=?').get(email).id;
  const { handleNotifications } = await import(worker('notifications.js'));
  const direct = new Request('https://centro.test/v1/notifications', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await handleNotifications(direct, env, new URL(direct.url))).status, 403);
  const internal = new Request('https://centro.test/v1/internal/notifications', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-key': env.SYNC_SHARED_KEY }, body: JSON.stringify({ action: 'list', userId }) });
  assert.equal((await handleNotifications(internal, env, new URL(internal.url))).status, 403);
});

maybe('avisos financeiros não são gravados ou enviados ao técnico, e aviso da conta continua', async () => {
  const { env, email } = await setup();
  env.DB.raw.prepare("UPDATE cloud_users SET suite_role='tecnico' WHERE email=?").run(email);
  const userId = env.DB.raw.prepare('SELECT id FROM cloud_users WHERE email=?').get(email).id;
  const { deliver } = await import(worker('notifications.js'));
  const event = { type: 'conta_vencer', app: 'centro-custos', title: 'Conta', body: 'Valor R$ 500', dedupeKey: 'financial-test' };
  assert.equal((await deliver(env, { ...event, audience: 'all' })).created, 0);
  assert.equal((await deliver(env, { ...event, userId })).created, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, 0);
  assert.equal((await deliver(env, { userId, type: 'novo_acesso', title: 'Conta', body: 'Novo aparelho' })).created, 1);
  env.DB.raw.prepare("UPDATE cloud_users SET suite_role='engenharia' WHERE email=?").run(email);
  assert.equal((await deliver(env, { ...event, audience: 'all' })).created, 1);
});
