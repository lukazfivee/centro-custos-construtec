import { configuration } from '../protocol.js';
import { randomToken } from './session-store.js';
import { entryDocument, entryScript } from './entry-assets.js';

export async function handleChamadosEntry(request, env) {
  const url = new URL(request.url);
  const document = url.pathname === '/chamados/entrar';
  const script = url.pathname === '/chamados/entrar.js';
  if (!document && !script) return undefined;
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
  const config = configuration(env);
  if (!config) return new Response('A entrada no Chamados ainda não está ativada.', {
    status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
  if (url.protocol !== 'https:') {
    url.protocol = 'https:';
    return Response.redirect(url.href, 308);
  }
  const headers = {
    'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  };
  if (script) return new Response(entryScript, { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
  const nonce = randomToken();
  const origin = config.origin.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const body = entryDocument.replaceAll('__CHAMADOS_ORIGIN__', origin).replaceAll('__CSP_NONCE__', nonce);
  return new Response(body, { headers: {
    ...headers, 'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'nonce-" + nonce
      + "'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  } });
}
