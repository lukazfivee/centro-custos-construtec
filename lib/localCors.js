// CORS do app local (relatorio Strix): antes aceitava QUALQUER porta de localhost/127.0.0.1.
// Agora so as portas conhecidas da Suite, mais as configuradas por ambiente.
// Padrao: 3333 (este servidor), 5173 (Orcamentos em desenvolvimento), 5176 (API do Orcamentos) e 4555 (Chamados).
// Extras: PORT, CONSTRUTEC_API_PORT e CORS_LOCAL_PORTS (lista separada por virgula).
const DEFAULT_PORTS = [3333, 5173, 5176, 4555];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):(\d{1,5})$/;

function allowedPorts(env = process.env) {
  const extra = [env.PORT, env.CONSTRUTEC_API_PORT, ...String(env.CORS_LOCAL_PORTS || '').split(',')]
    .map((value) => Number(String(value ?? '').trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
  return new Set([...DEFAULT_PORTS, ...extra]);
}

// Devolve a origem se for local e de porta permitida; senao null.
function allowedLocalOrigin(origin, env = process.env) {
  const match = typeof origin === 'string' ? LOCAL_ORIGIN.exec(origin) : null;
  return match && allowedPorts(env).has(Number(match[2])) ? origin : null;
}

module.exports = { allowedLocalOrigin, allowedPorts, DEFAULT_PORTS };
