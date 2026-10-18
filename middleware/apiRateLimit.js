// Limite geral de requisicoes da API na nuvem (relatorio Strix): janela fixa por IP real (cf-connecting-ip).
// Teto alto de proposito: a sincronizacao do celular manda rajadas. O login ja tem limite proprio, mais estrito.
// Fora da nuvem (sem DATABASE_URL, app local) nao limita. So /api/health/live (barato, sem banco) e isento:
// /api/health e /api/health/ready consultam o banco e entram no limite.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;
const MAX_NO_IP = 3000;
const MAX_BUCKETS = 10_000;

function createApiRateLimit({ now = Date.now, windowMs = WINDOW_MS, max = MAX_PER_WINDOW, maxNoIp = MAX_NO_IP, maxBuckets = MAX_BUCKETS, enabled = () => Boolean(process.env.DATABASE_URL) } = {}) {
  const buckets = new Map();
  let nextSweep = 0;
  return function apiRateLimit(req, res, next) {
    if (!enabled() || /^\/health\/live\/?$/.test(req.path || '')) return next();
    const header = req.headers['cf-connecting-ip'];
    const ip = typeof header === 'string' && header.trim() ? header.split(',')[0].trim() : null;
    const key = ip || 'sem-ip-confiavel';
    const limit = ip ? max : maxNoIp;
    const time = now();
    // Limpeza agendada (uma vez por janela), nunca uma varredura por cliente novo.
    if (time >= nextSweep) {
      for (const [k, b] of buckets) if (b.resetAt <= time) buckets.delete(k);
      nextSweep = time + windowMs;
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      // Mapa com teto: se estourar, descarta o mais antigo (ordem de insercao do Map).
      if (buckets.size >= maxBuckets) buckets.delete(buckets.keys().next().value);
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
