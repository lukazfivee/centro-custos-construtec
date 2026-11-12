const test = require('node:test');
const assert = require('node:assert/strict');
const { sqlite, setup } = require('./helpers/central-harness');

const maybe = sqlite ? test : test.skip;

const people = {
  dev: { name: 'PCM', email: 'pcm@rcconstrutec.com.br', password: 'senha-pcm-1234567', role: 'admin' },
  dev2: { name: 'Dev2', email: 'dev2@rcconstrutec.com.br', password: 'senha-dev2-123456', role: 'admin' },
  fulano: { name: 'Fulano', email: 'fulano@rcconstrutec.com.br', password: 'senha-fulano-12', role: 'gestor' },
};

async function world() {
  const ctx = await setup();
  for (const user of Object.values(people)) await ctx.call('POST', '/v1/users', { token: ctx.adminToken, body: user });
  ctx.env.DB.raw.prepare("UPDATE cloud_users SET suite_role='dev' WHERE email IN (?,?)").run(people.dev.email, people.dev2.email);
  const login = async (user) => (await ctx.call('POST', '/v1/auth/login', { body: user })).data.sessionToken;
  return { ...ctx, login, devToken: await login(people.dev), fulanoToken: await login(people.fulano) };
}

maybe('auditoria: so o dev le, e as acoes dele ficam registradas', async () => {
  const { call, devToken, fulanoToken, adminToken } = await world();
  assert.equal((await call('GET', '/v1/dev/audit')).status, 401);
  assert.equal((await call('GET', '/v1/dev/audit', { token: fulanoToken })).status, 403);
  assert.equal((await call('GET', '/v1/dev/audit', { token: adminToken })).status, 403);

  await call('POST', '/v1/users/password', { token: devToken, body: { email: people.fulano.email, password: 'senha-nova-123456' } });
  await call('POST', '/v1/users/status', { token: devToken, body: { email: people.fulano.email, active: false } });
  await call('POST', '/v1/users/status', { token: devToken, body: { email: people.fulano.email, active: true } });
  await call('POST', '/v1/users/access', { token: devToken, body: { email: people.fulano.email, suiteRole: 'financeiro' } });
  await call('POST', '/v1/permissions', { token: devToken, body: { role: 'tecnico', permission: 'p3', allowed: true } });
  await call('POST', '/v1/permissions/reset', { token: devToken });
  // Acao de admin comum nao entra na trilha do dev.
  await call('POST', '/v1/users/status', { token: adminToken, body: { email: people.fulano.email, active: true } });

  const { status, data } = await call('GET', '/v1/dev/audit', { token: devToken });
  assert.equal(status, 200);
  const actions = data.entries.map((e) => e.action).reverse();
  assert.deepEqual(actions, ['senha_trocada', 'conta_desativada', 'conta_ativada', 'papel_alterado', 'permissao_alterada', 'permissoes_restauradas']);
  assert.ok(data.entries.every((e) => e.actorEmail === people.dev.email));
  assert.equal(data.entries.find((e) => e.action === 'papel_alterado').detail.para, 'financeiro');
  // A senha nunca entra no registro.
  assert.ok(!JSON.stringify(data).includes('senha-nova'));
});

maybe('sessoes: dev lista, derruba as de outro e nao alcanca dev', async () => {
  const { call, devToken, fulanoToken } = await world();
  const list = await call('GET', '/v1/dev/sessions', { token: devToken });
  assert.equal(list.status, 200);
  assert.ok(list.data.sessions.some((s) => s.email === people.fulano.email && !s.current));
  assert.ok(list.data.sessions.some((s) => s.email === people.dev.email && s.current));
  assert.ok(list.data.sessions.every((s) => !('tokenHash' in s) && !('token_hash' in s)));

  assert.equal((await call('POST', '/v1/dev/sessions/revoke', { token: fulanoToken, body: { email: people.fulano.email } })).status, 403);
  assert.equal((await call('POST', '/v1/dev/sessions/revoke', { token: devToken, body: { email: people.dev2.email } })).status, 403);
  assert.equal((await call('POST', '/v1/dev/sessions/revoke', { token: devToken, body: { email: people.dev.email } })).status, 400);
  assert.equal((await call('POST', '/v1/dev/sessions/revoke', { token: devToken, body: { email: 'x@rcconstrutec.com.br' } })).status, 404);
  const revoked = await call('POST', '/v1/dev/sessions/revoke', { token: devToken, body: { email: people.fulano.email } });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.revoked, 1);
  assert.equal((await call('GET', '/v1/auth/session', { token: fulanoToken })).status, 401);
  assert.equal((await call('GET', '/v1/auth/session', { token: devToken })).status, 200);
});

maybe('desbloqueio: libera o login depois de falhas seguidas', async () => {
  const { call, devToken, fulanoToken } = await world();
  for (let i = 0; i < 10; i += 1) await call('POST', '/v1/auth/login', { body: { email: people.fulano.email, password: 'errada-errada' } });
  assert.equal((await call('POST', '/v1/auth/login', { body: people.fulano })).status, 429);
  assert.equal((await call('POST', '/v1/dev/users/unlock', { token: fulanoToken, body: { email: people.fulano.email } })).status, 403);
  assert.equal((await call('POST', '/v1/dev/users/unlock', { token: devToken, body: { email: people.fulano.email } })).status, 200);
  assert.equal((await call('POST', '/v1/auth/login', { body: people.fulano })).status, 200);
});

maybe('ver como: sessao curta na pele de outro, marcada e encerrada pelo alvo', async () => {
  const { call, env, devToken, fulanoToken, adminToken } = await world();
  assert.equal((await call('POST', '/v1/dev/impersonate', { token: fulanoToken, body: { email: people.fulano.email } })).status, 403);
  assert.equal((await call('POST', '/v1/dev/impersonate', { token: adminToken, body: { email: people.fulano.email } })).status, 403);
  assert.equal((await call('POST', '/v1/dev/impersonate', { token: devToken, body: { email: people.dev2.email } })).status, 403);
  assert.equal((await call('POST', '/v1/dev/impersonate', { token: devToken, body: { email: people.dev.email } })).status, 400);
  assert.equal((await call('POST', '/v1/dev/impersonate', { token: devToken, body: { email: 'x@rcconstrutec.com.br' } })).status, 404);

  const started = await call('POST', '/v1/dev/impersonate', { token: devToken, body: { email: people.fulano.email } });
  assert.equal(started.status, 200);
  assert.equal(started.data.user.email, people.fulano.email);
  assert.equal(started.data.impersonatedBy.email, people.dev.email);
  const asFulano = started.data.sessionToken;
  const left = started.data.expiresAt - Math.floor(Date.now() / 1000);
  assert.ok(left > 0 && left <= 30 * 60, 'sessao de ver como dura no maximo 30 minutos');

  const session = await call('GET', '/v1/auth/session', { token: asFulano });
  assert.equal(session.data.user.email, people.fulano.email);
  assert.equal(session.data.impersonatedBy.email, people.dev.email);
  // A sessao normal do Fulano nao e marcada, e a do dev continua valendo.
  assert.equal((await call('GET', '/v1/auth/session', { token: fulanoToken })).data.impersonatedBy, undefined);
  // Na pele de outro nao ha ferramenta de dev.
  assert.equal((await call('GET', '/v1/dev/audit', { token: asFulano })).status, 403);
  const listed = await call('GET', '/v1/dev/sessions', { token: devToken });
  assert.equal(listed.data.sessions.filter((s) => s.viewAs).length, 1);

  assert.equal((await call('POST', '/v1/dev/impersonate/end', { token: fulanoToken })).status, 400);
  assert.equal((await call('POST', '/v1/dev/impersonate/end', { token: asFulano })).status, 200);
  assert.equal((await call('GET', '/v1/auth/session', { token: asFulano })).status, 401);
  assert.equal((await call('GET', '/v1/auth/session', { token: fulanoToken })).status, 200);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM dev_impersonations').get().n, 0);

  const audit = (await call('GET', '/v1/dev/audit', { token: devToken })).data.entries.map((e) => e.action).reverse();
  assert.deepEqual(audit, ['ver_como_inicio', 'ver_como_fim']);
  // Conta desativada nao admite ver como.
  await call('POST', '/v1/users/status', { token: devToken, body: { email: people.fulano.email, active: false } });
  assert.equal((await call('POST', '/v1/dev/impersonate', { token: devToken, body: { email: people.fulano.email } })).status, 409);
});

maybe('a via de servico do Orcamentos nao alcanca as rotas de dev', async () => {
  const { call, devToken } = await world();
  const key = 's'.repeat(40);
  assert.equal((await call('GET', '/v1/dev/audit', { token: devToken, service: key })).status, 404);
  assert.equal((await call('POST', '/v1/dev/impersonate', { token: devToken, service: key, body: { email: people.fulano.email } })).status, 404);
});
