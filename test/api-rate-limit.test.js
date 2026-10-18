const test = require('node:test');
const assert = require('node:assert/strict');
const { createApiRateLimit } = require('../middleware/apiRateLimit');

const run = (limit, req) => {
  const result = { next: false, status: null, headers: {} };
  const res = {
    setHeader: (k, v) => { result.headers[k] = v; },
    status(code) { result.status = code; return this; },
    json() { return this; },
  };
  limit({ headers: {}, path: '/centros-custo', ...req }, res, () => { result.next = true; });
  return result;
};

test('limite geral da API: passa ate o teto por IP, depois 429 com Retry-After, e a janela reabre', () => {
  let now = 1_000_000;
  const limit = createApiRateLimit({ now: () => now, max: 3, maxNoIp: 5, enabled: () => true });
  const ip = { headers: { 'cf-connecting-ip': '203.0.113.7' } };
  for (let i = 0; i < 3; i += 1) assert.equal(run(limit, ip).next, true);
  const blocked = run(limit, ip);
  assert.equal(blocked.next, false);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['Retry-After']) >= 1);
  assert.equal(run(limit, { headers: { 'cf-connecting-ip': '203.0.113.8' } }).next, true);
  now += 60_001;
  assert.equal(run(limit, ip).next, true);
});

test('limite geral da API: sem IP confiavel usa balde maior; so o health/live e o app local nunca sao limitados', () => {
  const limit = createApiRateLimit({ now: () => 1, max: 1, maxNoIp: 2, enabled: () => true });
  assert.equal(run(limit, {}).next, true);
  assert.equal(run(limit, {}).next, true);
  assert.equal(run(limit, {}).status, 429);
  for (let i = 0; i < 20; i += 1) assert.equal(run(limit, { path: '/health/live' }).next, true);
  const local = createApiRateLimit({ now: () => 1, max: 1, maxNoIp: 1, enabled: () => false });
  for (let i = 0; i < 20; i += 1) assert.equal(run(local, {}).next, true);
});

test('limite geral da API: health e health/ready consultam o banco e entram no limite', () => {
  const limit = createApiRateLimit({ now: () => 1, max: 2, maxNoIp: 2, enabled: () => true });
  const ip = { headers: { 'cf-connecting-ip': '203.0.113.9' } };
  for (const path of ['/health', '/health/ready']) assert.equal(run(limit, { ...ip, path }).next, true);
  assert.equal(run(limit, { ...ip, path: '/health/ready' }).status, 429);
  assert.equal(run(limit, { ...ip, path: '/health/live' }).next, true);
});

test('limite geral da API: mapa de baldes tem teto e a limpeza e agendada, sem varrer a cada IP novo', () => {
  let now = 1_000;
  const limit = createApiRateLimit({ now: () => now, windowMs: 1_000, max: 5, maxBuckets: 3, enabled: () => true });
  for (let n = 1; n <= 50; n += 1) assert.equal(run(limit, { headers: { 'cf-connecting-ip': `198.51.100.${n}` } }).next, true);
  // IP antigo foi descartado pelo teto e comeca um balde novo, sem erro nem crescimento sem limite.
  assert.equal(run(limit, { headers: { 'cf-connecting-ip': '198.51.100.1' } }).next, true);
  now += 5_000;
  assert.equal(run(limit, { headers: { 'cf-connecting-ip': '198.51.100.200' } }).next, true);
});
