import {
  APPLICATION, PROTOCOL_VERSION, configuration, record, validCode, validToken,
} from '../protocol.js';
import {
  exchangeHandoff, findHandoff, hash, randomToken, readGrantedSession, storeHandoff,
} from './session-store.js';

const unavailable = () => ({ unavailable: true, code: 'CENTRAL_UNAVAILABLE' });
const invalid = (code = 'SESSION_INVALID') => ({ invalid: true, code });
const nowSeconds = () => Math.floor(Date.now() / 1000);

function sameKey(actual, expected) {
  if (typeof actual !== 'string' || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function serviceInput(env, input) {
  const config = configuration(env);
  if (!config || !env.DB?.prepare || typeof env.DB.batch !== 'function') return { error: unavailable() };
  if (!record(input) || !sameKey(input.serviceKey, config.serviceKey)) return { error: invalid('SERVICE_FORBIDDEN') };
  if (input.application !== APPLICATION || input.origin !== config.origin) return { error: invalid('TARGET_INVALID') };
  return { config };
}

function envelope(config, granted) {
  return {
    ok: true, protocolVersion: PROTOCOL_VERSION, application: APPLICATION, origin: config.origin,
    expiresAt: granted.expiresAt, grantRevision: granted.row.grant_revision, identity: granted.identity,
  };
}

export async function verifyChamadosSession(env, input) {
  const { config, error } = serviceInput(env, input);
  if (error) return error;
  if (!validToken(input.token)) return invalid();
  try {
    const granted = await readGrantedSession(env, await hash(input.token), config, nowSeconds());
    return granted ? envelope(config, granted) : invalid();
  } catch {
    return unavailable();
  }
}

export async function consumeChamadosHandoff(env, input) {
  const { config, error } = serviceInput(env, input);
  if (error) return error;
  if (!validCode(input.code)) return invalid('HANDOFF_INVALID');
  try {
    const now = nowSeconds();
    const handoff = await findHandoff(env, config, await hash(input.code), now);
    if (!handoff) return invalid('HANDOFF_INVALID');
    const granted = await readGrantedSession(env, handoff.session_hash, config, now);
    if (!granted || granted.row.user_id !== handoff.user_id
      || granted.row.grant_revision !== handoff.grant_revision) return invalid('HANDOFF_INVALID');
    const sessionToken = randomToken();
    const expiresAt = Math.min(now + 8 * 3600, granted.expiresAt);
    const exchange = await exchangeHandoff(env, config, granted, handoff, now, await hash(sessionToken), expiresAt);
    if (exchange.ok !== true) return exchange.invalid ? invalid('HANDOFF_INVALID') : exchange;
    // Read current central authority again, including a revocation just after the atomic exchange.
    const current = await readGrantedSession(env, await hash(sessionToken), config, nowSeconds());
    return current ? { ...envelope(config, current), sessionToken } : invalid('HANDOFF_INVALID');
  } catch {
    return unavailable();
  }
}

function json(result, failureStatus = 401) {
  const status = result.ok ? 200 : result.unavailable ? 503
    : result.code === 'SERVICE_FORBIDDEN' ? 403 : failureStatus;
  return Response.json(result, { status, headers: {
    'cache-control': 'no-store', 'pragma': 'no-cache', 'x-content-type-options': 'nosniff',
  } });
}

function bearer(request) {
  const authorization = request.headers.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

// Existing Centro JWT handoffs retain only a central session hash. That source
// bridge is accepted solely with the central SYNC key; the Chamados verifier
// still accepts only a full opaque token and its separate service credential.
export async function sourceSessionHash(request, env) {
  const token = bearer(request);
  if (validToken(token)) return hash(token);
  const supplied = request.headers.get('x-sync-key');
  const expected = String(env.SYNC_SHARED_KEY || '').replace(/^\uFEFF/, '').trim();
  return /^hash:[a-f0-9]{64}$/.test(token) && expected.length >= 32 && sameKey(supplied, expected)
    ? token.slice(5) : undefined;
}

export async function getChamadosAccess(request, env) {
  const config = configuration(env);
  if (!config || !env.DB?.prepare || typeof env.DB.batch !== 'function') return json(unavailable());
  try {
    const source = await sourceSessionHash(request, env);
    const granted = source && await readGrantedSession(env, source, config, nowSeconds());
    return granted ? json({ ok: true, allowed: true, application: APPLICATION,
      origin: config.origin, expiresAt: granted.expiresAt }) : json(invalid('APP_ACCESS_DENIED'), 403);
  } catch {
    return json(unavailable());
  }
}

export async function issueChamadosHandoff(request, env, body) {
  const config = configuration(env);
  if (!config || !env.DB?.prepare || typeof env.DB.batch !== 'function') return json(unavailable());
  if (!record(body) || body.target !== APPLICATION || Object.keys(body).some((key) => key !== 'target')) {
    return json(invalid('TARGET_INVALID'), 400);
  }
  try {
    const source = await sourceSessionHash(request, env);
    if (!source) return json(invalid());
    const now = nowSeconds();
    const granted = await readGrantedSession(env, source, config, now);
    if (!granted) return json(invalid('APP_ACCESS_DENIED'), 403);
    const code = randomToken();
    const expiresAt = Math.min(now + 60, granted.expiresAt);
    const stored = await storeHandoff(env, config, granted, now, await hash(code), expiresAt);
    if (stored.ok !== true) return json(stored, 403);
    return json({ ok: true, code, expiresAt, target: APPLICATION, origin: config.origin,
      url: config.origin + '/#handoff=' + code });
  } catch {
    return json(unavailable());
  }
}

export async function consumeChamadosHandoffResponse(request, env, body) {
  if (!record(body) || body.target !== APPLICATION
    || Object.keys(body).some((key) => !['target', 'code', 'origin'].includes(key))) return json(invalid('TARGET_INVALID'), 400);
  return json(await consumeChamadosHandoff(env, {
    application: body.target, code: body.code, origin: body.origin,
    serviceKey: request.headers.get('x-chamados-service-key'),
  }), 400);
}

export async function handleChamadosCentral(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/v1/auth/chamados/access') return request.method === 'GET'
    ? getChamadosAccess(request, env) : new Response(null, { status: 405, headers: { allow: 'GET' } });
  const verify = path === '/v1/internal/chamados/session';
  const consume = path === '/v1/internal/chamados/handoff/consume';
  if (!verify && !consume) return undefined;
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  let body;
  try {
    const source = await request.text();
    if (source.length > 4096) return json(invalid('BODY_INVALID'), 400);
    body = JSON.parse(source);
  } catch {
    return json(invalid('BODY_INVALID'), 400);
  }
  const allowed = verify ? ['token', 'application', 'origin'] : ['code', 'application', 'origin'];
  if (!record(body) || Object.keys(body).some((key) => !allowed.includes(key))) return json(invalid('BODY_INVALID'), 400);
  const input = { ...body, serviceKey: request.headers.get('x-chamados-service-key') };
  return json(await (verify ? verifyChamadosSession(env, input) : consumeChamadosHandoff(env, input)), consume ? 400 : 401);
}
