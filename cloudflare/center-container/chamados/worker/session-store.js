import { APPLICATION, explicitChamadosApp, validateIdentity } from '../protocol.js';

// Check every ancestor, including missing/revoked parents and cycles.
// A child cannot outlive its original central login, even after nested handoffs.
const AUTHORIZED = `
WITH RECURSIVE lineage AS (
  SELECT token_hash, user_id, org_id, expires_at, parent_session_hash, 0 AS depth
  FROM cloud_sessions WHERE token_hash = ?
  UNION ALL
  SELECT p.token_hash, p.user_id, p.org_id, p.expires_at, p.parent_session_hash, c.depth + 1
  FROM cloud_sessions p JOIN lineage c ON p.token_hash = c.parent_session_hash
  WHERE c.depth < 16
), authorized AS (
  SELECT s.token_hash, s.user_id, s.org_id, u.name, u.suite_role, u.role AS legacy_role, u.apps,
    (SELECT MIN(expires_at) FROM lineage) AS session_expires_at,
    g.identity_type AS grant_type, g.capabilities_json AS grant_capabilities,
    g.scope_json AS grant_scope, g.revision AS grant_revision, g.expires_at AS grant_expires_at
  FROM cloud_sessions s
  JOIN cloud_users u ON u.id = s.user_id AND u.org_id = s.org_id
  JOIN chamados_access_grants g ON g.user_id = u.id AND g.org_id = u.org_id
  WHERE s.token_hash = ? AND u.active = 1 AND u.deleted_at IS NULL
    AND g.application = 'chamados' AND g.active = 1 AND g.revoked_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM lineage l WHERE l.expires_at <= ? OR l.user_id <> s.user_id OR l.org_id <> s.org_id
        OR l.depth >= 16 OR (l.parent_session_hash IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM cloud_sessions p WHERE p.token_hash = l.parent_session_hash
        ))
    )
    AND (g.expires_at IS NULL OR g.expires_at > ?) AND s.org_id = ?
)
`;

// Compare every authorization field observed before the transaction.
// A concurrent grant/identity change cannot turn an already-read code into a wider session.
const SAME_GRANT = `user_id = ? AND grant_revision = ? AND grant_type = ?
  AND grant_capabilities = ? AND grant_scope = ? AND apps IS ? AND suite_role IS ? AND legacy_role IS ?
  AND name = ? AND grant_expires_at IS ?`;

function grantedStatement(env, hash, config, now, tail, args = []) {
  return env.DB.prepare(AUTHORIZED + tail).bind(hash, hash, now, now, config.organizationId, ...args);
}

function grantArguments(row) {
  return [row.user_id, row.grant_revision, row.grant_type, row.grant_capabilities,
    row.grant_scope, row.apps, row.suite_role, row.legacy_role, row.name, row.grant_expires_at];
}

export async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function readGrantedSession(env, tokenHash, config, now) {
  const row = await grantedStatement(env, tokenHash, config, now, 'SELECT * FROM authorized').first();
  if (!row || !explicitChamadosApp(row.apps)) return undefined;
  let capabilities, scope;
  try { capabilities = JSON.parse(row.grant_capabilities); scope = JSON.parse(row.grant_scope); }
  catch { return undefined; }
  const identity = validateIdentity({
    userId: row.user_id, organizationId: row.org_id, name: row.name, active: true,
    application: APPLICATION, type: row.grant_type,
    suiteRole: row.grant_type === 'portal' ? null : row.suite_role
      || (row.legacy_role === 'admin' ? 'admin' : row.legacy_role === 'gestor' ? 'gestor' : 'tecnico'),
    capabilities, scope,
  }, config.organizationId);
  const expiresAt = Math.min(row.session_expires_at, row.grant_expires_at ?? Infinity);
  if (!identity || !Number.isSafeInteger(row.grant_revision) || row.grant_revision < 1
    || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return undefined;
  return { row, identity, expiresAt };
}

function guard(env) {
  const token = crypto.randomUUID();
  return {
    check: env.DB.prepare('INSERT INTO chamados_write_guards(token, succeeded) VALUES(?, changes())').bind(token),
    clear: env.DB.prepare('DELETE FROM chamados_write_guards WHERE token = ?').bind(token),
  };
}

async function batch(env, statements) {
  if (typeof env.DB?.batch !== 'function') return { unavailable: true };
  try {
    await env.DB.batch(statements);
    return { ok: true };
  } catch (error) {
    return /CHECK constraint failed|chamados_write_guards/.test(String(error?.message))
      ? { invalid: true } : { unavailable: true };
  }
}

export async function storeHandoff(env, config, granted, now, codeHash, expiresAt) {
  const check = guard(env);
  const insert = grantedStatement(env, granted.row.token_hash, config, now, `
    INSERT INTO chamados_handoffs(code_hash, session_hash, user_id, org_id, origin, grant_revision, expires_at)
    SELECT ?, token_hash, user_id, org_id, ?, grant_revision, ? FROM authorized WHERE ${SAME_GRANT}
  `, [codeHash, config.origin, expiresAt, ...grantArguments(granted.row)]);
  return batch(env, [insert, check.check, check.clear]);
}

export async function findHandoff(env, config, codeHash, now) {
  return env.DB.prepare(`SELECT * FROM chamados_handoffs
    WHERE code_hash = ? AND target = 'chamados' AND origin = ? AND org_id = ?
      AND used_at IS NULL AND expires_at > ?`)
    .bind(codeHash, config.origin, config.organizationId, now).first();
}

export async function exchangeHandoff(env, config, granted, handoff, now, newTokenHash, expiresAt) {
  const usedAt = Date.now();
  const timestamp = new Date(usedAt).toISOString();
  const claimed = guard(env), inserted = guard(env);
  const claim = grantedStatement(env, handoff.session_hash, config, now, `
    UPDATE chamados_handoffs SET used_at = ?
    WHERE code_hash = ? AND origin = ? AND org_id = ? AND user_id = ?
      AND target = 'chamados' AND used_at IS NULL AND expires_at > ? AND grant_revision = ?
      AND EXISTS(SELECT 1 FROM authorized WHERE ${SAME_GRANT})
  `, [usedAt, handoff.code_hash, config.origin, config.organizationId, granted.row.user_id,
    now, granted.row.grant_revision, ...grantArguments(granted.row)]);
  const create = grantedStatement(env, handoff.session_hash, config, now, `
    INSERT INTO cloud_sessions(token_hash, user_id, org_id, instance_id, instance_name,
      created_at, expires_at, last_seen_at, parent_session_hash)
    SELECT ?, user_id, org_id, ?, 'Chamados web', ?, ?, ?, token_hash FROM authorized
    WHERE ${SAME_GRANT} AND EXISTS(
      SELECT 1 FROM chamados_handoffs WHERE code_hash = ? AND used_at = ? AND origin = ?
    )
  `, [newTokenHash, crypto.randomUUID(), timestamp, expiresAt, timestamp,
    ...grantArguments(granted.row), handoff.code_hash, usedAt, config.origin]);
  return batch(env, [claim, claimed.check, create, inserted.check, claimed.clear, inserted.clear]);
}
