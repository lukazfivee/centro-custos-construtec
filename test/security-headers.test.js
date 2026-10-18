const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Trava o que ja existe (middleware/observability.js) para o relatorio Strix nao reabrir o assunto:
// nosniff, no-referrer e CSP com frame-ancestors ja saem em toda resposta.
test('respostas do Centro trazem nosniff, Referrer-Policy e frame-ancestors', async (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'centro-custos-headers-'));
  process.env.PGLITE_DATA_DIR = path.join(tempRoot, 'database');
  process.env.RESTORE_ROOT_DIR = path.join(tempRoot, 'restore');
  process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  delete process.env.DATABASE_URL;
  const { createApp } = require('../server');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health/live`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  // Quem pode embutir o Centro ja e limitado por frame-ancestors.
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'self'/);
});
