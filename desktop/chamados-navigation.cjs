function configuredOrigin(environment) {
  if (environment.CHAMADOS_ENABLED !== 'true') return undefined;
  try {
    const value = environment.CHAMADOS_PUBLIC_ORIGIN;
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && url.pathname === '/'
      && !url.username && !url.password && !url.search && !url.hash ? value : undefined;
  } catch { return undefined; }
}

async function openChamados({ module, port, token, openExternal, fetcher = fetch }) {
  if (!module?.origin || !configuredOrigin({ CHAMADOS_ENABLED: 'true', CHAMADOS_PUBLIC_ORIGIN: module.origin })
    || !Number.isInteger(port) || port < 1 || port > 65535 || typeof token !== 'string' || !token) return { switched: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetcher(new Request('http://127.0.0.1:' + port + '/api/auth/suite-handoff', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ target: 'chamados' }),
    }));
    if (!response.ok) return { switched: false };
    const data = await response.json();
    if (data.origin !== module.origin || data.target !== 'chamados' || !/^[A-Za-z0-9_-]{43}$/.test(data.code)
      || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) return { switched: false };
    await openExternal(module.origin + '/#handoff=' + data.code);
    return { switched: true, external: true };
  } catch {
    return { switched: false };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { configuredOrigin, openChamados };
