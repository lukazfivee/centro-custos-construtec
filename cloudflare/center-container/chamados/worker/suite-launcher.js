// A public app selector in front of the byte-preserved Central production Worker.
import { suiteDocument, suiteStyles, suiteScript } from './suite-launcher-assets.js';
const PAGES = new Set(['/', '/suite', '/suite/']);
const ASSETS = new Map([
  ['/suite/suite.css', [suiteStyles, 'text/css; charset=utf-8']],
  ['/suite/suite.js', [suiteScript, 'application/javascript; charset=utf-8']],
]);
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function headers(type) {
  return { 'content-type': type, 'cache-control': 'no-store',
    'content-security-policy': CSP, 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' };
}
export function handleSuiteLauncher(request) {
  const url = new URL(request.url);
  const isPage = PAGES.has(url.pathname);
  const asset = ASSETS.get(url.pathname);
  if (!isPage && !asset) return undefined;
  // Legacy Central login and explicit query-based callbacks keep the original handler.
  if (url.pathname === '/' && url.search) return undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (url.pathname === '/') return undefined;
    return new Response(null, { status: 405,
      headers: { ...headers('text/plain; charset=utf-8'), allow: 'GET, HEAD' } });
  }
  let body = asset?.[0];
  const type = asset?.[1] || 'text/html; charset=utf-8';
  if (isPage) {
    const mobile = /Android|iPhone|iPad|iPod|Mobile|SuiteConstrutec\//i.test(request.headers.get('user-agent') || '');
    body = suiteDocument.replace('__CENTRO_ENTRY__', mobile ? '/m/' : '/d/');
  }
  return new Response(request.method === 'HEAD' ? null : body, { headers: headers(type) });
}
