// Ferramentas do papel dev no diretorio central: auditoria, sessoes, desbloqueio e "ver como".
// Todas as rotas exigem sessao propria de um dev (nunca a via de servico) e nunca alcancam outro dev.
import { json, text, validEmail, requireSession, createSession, publicUser, ORG_ID } from './centralAuth.js';
import { effectiveSuiteRole } from './suiteRoles.js';
import { clearLoginFailures } from './loginGuard.js';

export const DEV_ROUTES = [
  '/v1/dev/audit',
  '/v1/dev/sessions',
  '/v1/dev/sessions/revoke',
  '/v1/dev/users/unlock',
  '/v1/dev/impersonate',
  '/v1/dev/impersonate/end',
];

const IMPERSONATION_SECONDS = 30 * 60;
const AUDIT_MAX = 200;
const NOT_DEV = 'Somente um dev pode usar as ferramentas de dev.';
const OTHER_DEV = 'As contas de outro dev ficam de fora.';

// Falha na gravacao nunca derruba a acao (a tabela pode faltar antes da migracao 014).
export async function devAudit(env, actor, action, target = null, detail = null) {
  try {
    await env.DB.prepare(`INSERT INTO dev_audit(id,org_id,actor_id,actor_email,action,target_id,target_email,detail,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), actor.org_id || ORG_ID, actor.id, actor.email, action,
      target?.id || null, target?.email || null, detail ? JSON.stringify(detail).slice(0, 1000) : null, new Date().toISOString(),
    ).run();
    return true;
  } catch { return false; }
}

async function requireDev(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return { response: json({ ok: false, error: auth.error }, auth.status) };
  if (effectiveSuiteRole(auth.user) !== 'dev') return { response: json({ ok: false, error: NOT_DEV }, 403) };
  const impersonated = await env.DB.prepare('SELECT 1 AS x FROM dev_impersonations WHERE token_hash=?').bind(auth.user.token_hash).first().catch(() => null);
  if (impersonated) return { response: json({ ok: false, error: NOT_DEV }, 403) };
  return { user: auth.user };
}

async function readBody(request) {
  try { return (await request.json()) || {}; } catch { return null; }
}

// Alvo por e-mail: existe, nao e o proprio dev e nao e outro dev.
async function targetOf(env, dev, body, { allowSelf = false } = {}) {
  const email = text(body?.email).toLowerCase();
  if (!validEmail(email)) return { response: json({ ok: false, error: 'E-mail invalido.' }, 400) };
  const target = await env.DB.prepare('SELECT * FROM cloud_users WHERE org_id=? AND email=? AND deleted_at IS NULL').bind(dev.org_id, email).first();
  if (!target) return { response: json({ ok: false, error: 'Usuario nao encontrado.' }, 404) };
  if (target.id === dev.id && !allowSelf) return { response: json({ ok: false, error: 'Escolha outra conta.' }, 400) };
  if (target.id !== dev.id && effectiveSuiteRole(target) === 'dev') return { response: json({ ok: false, error: OTHER_DEV }, 403) };
  return { target };
}

async function listAudit(request, env, dev) {
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get('limit')) || 100, 1), AUDIT_MAX);
  const rows = (await env.DB.prepare('SELECT * FROM dev_audit WHERE org_id=? ORDER BY created_at DESC LIMIT ?').bind(dev.org_id, limit).all().catch(() => ({ results: [] }))).results || [];
  return json({ ok: true, entries: rows.map((r) => ({
    id: r.id, actorEmail: r.actor_email, action: r.action, targetEmail: r.target_email,
    detail: r.detail ? JSON.parse(r.detail) : null, createdAt: r.created_at,
  })) });
}

async function listSessions(env, dev) {
  const now = Math.floor(Date.now() / 1000);
  const rows = (await env.DB.prepare(`SELECT s.created_at,s.last_seen_at,s.instance_name,s.expires_at,s.token_hash,u.id AS user_id,u.name,u.email,u.suite_role,u.role
    FROM cloud_sessions s JOIN cloud_users u ON u.id=s.user_id AND u.org_id=s.org_id
    WHERE s.org_id=? AND s.expires_at>? AND u.deleted_at IS NULL ORDER BY s.last_seen_at DESC`).bind(dev.org_id, now).all()).results || [];
  const imp = new Set(((await env.DB.prepare('SELECT token_hash FROM dev_impersonations WHERE expires_at>?').bind(now).all().catch(() => ({ results: [] }))).results || []).map((r) => r.token_hash));
  return json({ ok: true, sessions: rows.map((r) => ({
    userId: r.user_id, name: r.name, email: r.email, suiteRole: effectiveSuiteRole(r), instanceName: r.instance_name || null,
    createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at, current: r.token_hash === dev.token_hash, viewAs: imp.has(r.token_hash),
  })) });
}

async function revokeSessions(request, env, dev) {
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'JSON invalido.' }, 400);
  const { response, target } = await targetOf(env, dev, body);
  if (response) return response;
  const res = await env.DB.prepare('DELETE FROM cloud_sessions WHERE user_id=?').bind(target.id).run();
  const revoked = Number(res.meta?.changes || 0);
  await devAudit(env, dev, 'sessoes_derrubadas', target, { revoked });
  return json({ ok: true, revoked });
}

async function unlockUser(request, env, dev) {
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'JSON invalido.' }, 400);
  const { response, target } = await targetOf(env, dev, body, { allowSelf: true });
  if (response) return response;
  await clearLoginFailures(env.DB, target.email);
  await devAudit(env, dev, 'login_desbloqueado', target);
  return json({ ok: true });
}

async function startImpersonation(request, env, dev) {
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'JSON invalido.' }, 400);
  const { response, target } = await targetOf(env, dev, body);
  if (response) return response;
  if (!target.active) return json({ ok: false, error: 'A conta esta desativada.' }, 409);
  const session = await createSession(env, target, request, { ttl: IMPERSONATION_SECONDS });
  try {
    await env.DB.prepare('INSERT INTO dev_impersonations(token_hash,dev_id,dev_email,target_id,created_at,expires_at) VALUES(?,?,?,?,?,?)')
      .bind(session.tokenHash, dev.id, dev.email, target.id, new Date().toISOString(), session.expiresAt).run();
  } catch {
    await env.DB.prepare('DELETE FROM cloud_sessions WHERE token_hash=?').bind(session.tokenHash).run();
    return json({ ok: false, error: 'Ver como indisponivel: falta a migracao 014.' }, 503);
  }
  await devAudit(env, dev, 'ver_como_inicio', target, { minutes: IMPERSONATION_SECONDS / 60 });
  return json({ ok: true, sessionToken: session.token, expiresAt: session.expiresAt, user: publicUser(target), impersonatedBy: { id: dev.id, email: dev.email } });
}

// Quem esta na pele de outro pode encerrar: a sessao do alvo e usada so para isso.
async function endImpersonation(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ ok: false, error: auth.error }, auth.status);
  const row = await env.DB.prepare('SELECT * FROM dev_impersonations WHERE token_hash=?').bind(auth.user.token_hash).first().catch(() => null);
  if (!row) return json({ ok: false, error: 'Esta nao e uma sessao de ver como.' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cloud_sessions WHERE token_hash=? OR parent_session_hash=?').bind(row.token_hash, row.token_hash),
    env.DB.prepare('DELETE FROM dev_impersonations WHERE token_hash=?').bind(row.token_hash),
  ]);
  await devAudit(env, { id: row.dev_id, email: row.dev_email, org_id: auth.user.org_id }, 'ver_como_fim', auth.user);
  return json({ ok: true });
}

// Quando a sessao e de ver como, devolve quem esta por tras (usado por /v1/auth/session).
export async function impersonatorOf(env, tokenHash) {
  const row = await env.DB.prepare('SELECT dev_id,dev_email FROM dev_impersonations WHERE token_hash=?').bind(tokenHash).first().catch(() => null);
  return row ? { id: row.dev_id, email: row.dev_email } : null;
}

export async function handleDevRoute(request, env, path) {
  const method = request.method;
  if (path === '/v1/dev/impersonate/end' && method === 'POST') return endImpersonation(request, env);
  const { response, user } = await requireDev(request, env);
  if (response) return response;
  if (path === '/v1/dev/audit' && method === 'GET') return listAudit(request, env, user);
  if (path === '/v1/dev/sessions' && method === 'GET') return listSessions(env, user);
  if (path === '/v1/dev/sessions/revoke' && method === 'POST') return revokeSessions(request, env, user);
  if (path === '/v1/dev/users/unlock' && method === 'POST') return unlockUser(request, env, user);
  if (path === '/v1/dev/impersonate' && method === 'POST') return startImpersonation(request, env, user);
  return json({ ok: false, error: 'Rota nao encontrada.' }, 404);
}
