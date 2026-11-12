const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedLocalOrigin, allowedPorts } = require('../lib/localCors');

test('CORS local: so as portas da Suite, nao qualquer porta de localhost', () => {
  const env = {};
  for (const origin of ['http://localhost:3333', 'http://127.0.0.1:3333', 'http://localhost:5173', 'http://127.0.0.1:5176', 'http://localhost:4555']) {
    assert.equal(allowedLocalOrigin(origin, env), origin, origin);
  }
  for (const origin of ['http://localhost:9999', 'http://127.0.0.1:80', 'http://localhost:22', 'http://localhost:65535']) {
    assert.equal(allowedLocalOrigin(origin, env), null, origin);
  }
});

test('CORS local: nao aceita host de fora, https, sem porta, porta fora do intervalo ou valor invalido', () => {
  const env = {};
  for (const origin of ['http://evil.example:3333', 'https://localhost:3333', 'http://localhost', 'http://localhost:3333.evil.com', 'http://localhost.evil.com:3333', 'http://127.0.0.1:3333/', 'http://[::1]:3333', 'null', '', undefined, null, 42]) {
    assert.equal(allowedLocalOrigin(origin, env), null, String(origin));
  }
});

test('CORS local: PORT, CONSTRUTEC_API_PORT e CORS_LOCAL_PORTS entram na lista; valores ruins sao ignorados', () => {
  const env = { PORT: '3456', CONSTRUTEC_API_PORT: '5199', CORS_LOCAL_PORTS: '7001, 7002 ,abc,0,70000,-1' };
  const ports = allowedPorts(env);
  for (const port of [3333, 5173, 5176, 4555, 3456, 5199, 7001, 7002]) assert.ok(ports.has(port), String(port));
  for (const port of [0, 70000, -1]) assert.ok(!ports.has(port), String(port));
  assert.equal(allowedLocalOrigin('http://localhost:5199', env), 'http://localhost:5199');
  assert.equal(allowedLocalOrigin('http://localhost:5199', {}), null);
});
