// Proposed Centro server bridge. Central authority is checked on every menu/open request.
function origin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/' && url.origin === value ? value : undefined;
  } catch { return undefined; }
}
const failure = (status = 503) => Object.assign(
  new Error(status === 403 ? 'O acesso ao Chamados não está liberado para esta conta.' : 'Não foi possível validar o acesso ao Chamados agora.'),
  { status, statusCode: status },
);

function createSuiteBridge({ environment = process.env, centralOrigin, fetcher = fetch }) {
  return async function requestChamados(action, user) {
    const destination = origin(environment.CHAMADOS_PUBLIC_ORIGIN);
    const central = origin(centralOrigin);
    if (environment.CHAMADOS_ENABLED !== 'true' || !destination || !central) throw failure();
    if (!user?.cloud_managed || typeof user.cloud_session_token !== 'string') throw failure(403);
    const token = user.cloud_session_token;
    const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
    if (/^hash:[a-f0-9]{64}$/.test(token)) {
      const key = String(environment.SYNC_SHARED_KEY || '').replace(/^\uFEFF/, '').trim();
      if (key.length < 32) throw failure();
      headers['x-sync-key'] = key;
    } else if (!/^[A-Za-z0-9+/_-]{43}$/.test(token)) throw failure(403);
    if (!['access', 'handoff'].includes(action)) throw failure(400);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetcher(new Request(central + (action === 'access'
        ? '/v1/auth/chamados/access' : '/v1/auth/handoff'), {
        method: action === 'access' ? 'GET' : 'POST', redirect: 'error', signal: controller.signal,
        headers, ...(action === 'handoff' ? { body: JSON.stringify({ target: 'chamados' }) } : {}),
      }));
      if (!response.ok) throw failure([401, 403].includes(response.status) ? 403 : 503);
      const source = await response.text();
      if (source.length > 4096) throw failure();
      const data = JSON.parse(source);
      if (data.ok !== true || data.invalid === true || data.origin !== destination
        || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) throw failure();
      if (action === 'access') {
        if (data.application !== 'chamados' || data.allowed !== true) throw failure(403);
        return { allowed: true, application: 'chamados', origin: destination, expiresAt: data.expiresAt };
      }
      if (data.target !== 'chamados' || !/^[A-Za-z0-9_-]{43}$/.test(data.code)) throw failure();
      return { code: data.code, target: 'chamados', origin: destination, expiresAt: data.expiresAt };
    } catch (error) {
      throw error?.status ? error : failure();
    } finally {
      clearTimeout(timer);
    }
  };
}

function registerRoutes(router, { autenticar, asyncRoute, cloudAuth }) {
  const bridge = () => createSuiteBridge({ centralOrigin: cloudAuth.apiUrl() });
  router.get('/suite-chamados', autenticar, asyncRoute(async (req, res) => {
    const data = await bridge()('access', req.usuario);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  }));
  const handoff = asyncRoute(async (req, res) => {
    if (!req.body || Object.keys(req.body).some((key) => key !== 'target')) throw failure(400);
    const data = await bridge()('handoff', req.usuario);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  });
  // Leave the existing Centro/Orçamentos route unchanged and in its original order.
  router.post('/suite-handoff', (req, res, next) => {
    if (req.body?.target !== 'chamados') return next();
    return autenticar(req, res, (error) => error ? next(error) : handoff(req, res, next));
  });
}

module.exports = { createSuiteBridge, registerRoutes };
