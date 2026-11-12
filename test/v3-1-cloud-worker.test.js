const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('atividade do Worker não pula eventos após uma página cheia', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-sync-worker', 'src', 'index.js'), 'utf8');
  const worker = await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { activityCursor };`).toString('base64')}`);
  const page = Array.from({ length: 50 }, (_, index) => ({ id: index + 11 }));

  assert.equal(worker.activityCursor(10, page, 50, 200), 60);
  assert.equal(worker.activityCursor(60, page.slice(0, 2), 50, 200), 200);
});

test('Worker de reports consulta a entrega real no provedor', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-report-worker', 'src', 'index.js'), 'utf8');
  assert.match(source, /api\.resend\.com\/emails\/\$\{encodeURIComponent\(report\.email_id\)\}/);
  assert.match(source, /data\.last_event/);
  assert.match(source, /\/v1\\\/reports\\\/\(\[\^\/\]\+\)\\\/status/);
  assert.match(source, /emailConfigured/);
});

test('e-mail do report diz de qual sistema veio (Centro ou Orcamentos)', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-report-worker', 'src', 'index.js'), 'utf8');
  const worker = await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { sendEmail };`).toString('base64')}`);
  const original = global.fetch;
  const enviar = async (platform) => {
    let payload;
    global.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ id: 'e1' }); };
    await worker.sendEmail({ RESEND_API_KEY: 'k', REPORT_FROM: 'Centro <no-reply@reports.rcconstrutec.com.br>' }, {
      report_id: 'RPT-1', title: 'T', type: 'bug', severity: 'alta', user_name: 'M', user_email: 'm@rcconstrutec.com.br',
      installation_name: 'I', platform, description: 'Descricao', created_at: '2026-10-13T00:00:00Z',
    });
    return payload;
  };
  try {
    const orcamentos = await enviar('orcamentos-celular');
    assert.match(orcamentos.html, /Novo report do Construtec Orçamentos/);
    assert.ok(orcamentos.tags.some((t) => t.name === 'system' && t.value === 'orcamentos'));
    const centro = await enviar('android');
    assert.match(centro.html, /Novo report do Centro de Custos/);
    assert.ok(centro.tags.some((t) => t.name === 'system' && t.value === 'centro-custos'));
  } finally { global.fetch = original; }
});
