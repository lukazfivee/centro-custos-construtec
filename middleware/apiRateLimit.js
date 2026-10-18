// Limite geral de requisicoes da API na nuvem (relatorio Strix): janela fixa por IP real (cf-connecting-ip).
// Teto alto de proposito: a sincronizacao do celular manda rajadas. O login ja tem limite proprio, mais estrito.
// Fora da nuvem (sem DATABASE_URL, app local) nao limita; /api/health nunca e limitado.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;
const MAX_NO_IP = 3000;

function createApiRateLimit({ now = Date.now, windowMs = WINDOW_MS, max = MAX_PER_WINDOW, maxNoIp = MAX_NO_IP, enabled = () => Boolean(process.env.DATABASE_URL) } = {}) {
  const buckets = new Map();
  return function apiRateLimit(req, res, next) {
    if (!enabled() || /^\/health(?:\/|$)/.test(req.path || '')) return next();
    const header = req.headers['cf-connecting-ip'];
    const ip = typeof header === 'string' && header.trim() ? header.split(',')[0].trim() : null;
    const key = ip || 'sem-ip-confiavel';
    const limit = ip ? max : maxNoIp;
    const time = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= time) buckets.delete(k);
      bucket = { count: 0, resetAt: time + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - time) / 1000))));
      return res.status(429).json({ error: 'Muitas requisições. Aguarde um instante e tente de novo.' });
    }
    return next();
  };
}

module.exports = { createApiRateLimit };
