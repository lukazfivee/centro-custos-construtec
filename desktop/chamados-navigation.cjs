// Chamados e O.S. dentro da Suíte do Windows: origem configurada, código de entrada (handoff) e regras de navegação.
// O Chamados é um site (Cloudflare) mostrado numa WebContentsView da mesma janela; a conta entra uma vez no Centro.
const DEFAULT_ORIGIN = 'https://construtec-chamados.construtec-reports.workers.dev';
const CODE = /^[A-Za-z0-9_-]{43}$/;

function validOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && url.pathname === '/'
      && !url.username && !url.password && !url.search && !url.hash ? value : undefined;
  } catch { return undefined; }
}

function configuredOrigin(environment) {
  if (environment.CHAMADOS_ENABLED !== 'true') return undefined;
  return validOrigin(environment.CHAMADOS_PUBLIC_ORIGIN);
}

// O app instalado já nasce com o Chamados ligado, sem pedir arquivo de configuração. Um .env ou variável de
// ambiente com outro valor (ou CHAMADOS_ENABLED=false) vence.
function applyDefaults(environment) {
  if (environment.CHAMADOS_ENABLED === undefined) environment.CHAMADOS_ENABLED = 'true';
  if (!environment.CHAMADOS_PUBLIC_ORIGIN) environment.CHAMADOS_PUBLIC_ORIGIN = DEFAULT_ORIGIN;
}

function sameOrigin(url, origin) {
  try { return Boolean(origin) && new URL(url).origin === origin; } catch { return false; }
}

function externalAllowed(url) {
  return /^(https?|mailto):/i.test(String(url));
}

const MESSAGES = {
  403: 'Sua conta não tem acesso ao Chamados. Peça a um administrador para liberar.',
  409: 'Só contas corporativas entram direto no Chamados.',
};
const GENERIC = 'Não foi possível validar o seu acesso ao Chamados agora.';

// Pede ao servidor local do Centro (mesmo processo) um código de uso único e monta o endereço de entrada.
// Devolve { ok: true, url } ou { ok: false, message }. O código nunca é registrado em log nem exibido.
async function requestChamadosHandoff({ module, port, token, fetcher = fetch }) {
  const origin = module?.origin && configuredOrigin({ CHAMADOS_ENABLED: 'true', CHAMADOS_PUBLIC_ORIGIN: module.origin });
  if (!origin) return { ok: false, message: 'O Chamados não está configurado nesta instalação.' };
  if (typeof token !== 'string' || !token || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, message: 'Entre no Centro de Custos antes de abrir o Chamados.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetcher(new Request('http://127.0.0.1:' + port + '/api/auth/suite-handoff', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ target: 'chamados' }),
    }));
    if (!response.ok) return { ok: false, message: MESSAGES[response.status] || GENERIC };
    const data = await response.json();
    if (data.origin !== origin || data.target !== 'chamados' || !CODE.test(data.code)
      || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) {
      return { ok: false, message: GENERIC };
    }
    return { ok: true, url: origin + '/#handoff=' + data.code };
  } catch {
    return { ok: false, message: GENERIC };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { DEFAULT_ORIGIN, validOrigin, configuredOrigin, applyDefaults, sameOrigin, externalAllowed, requestChamadosHandoff };
