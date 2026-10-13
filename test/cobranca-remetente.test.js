const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// O e-mail de cobranca sai do dominio verificado no Resend com o nome de quem esta logado; respostas vao para a conta dele.
async function enviar(usuario, extraEnv = {}) {
  const worker = await import(pathToFileURL(path.join(__dirname, '..', 'cloudflare', 'center-container', 'commercialSync.js')).href);
  const draft = { status:'authorized', to_json:'["cliente@exemplo.com.br"]', cc_json:'[]', subject:'Cobranca', body_text:'Segue a nota fiscal.', authorized_at:'2026-10-13T10:00:00Z', updated_at:'2026-10-13T10:00:00Z' };
  const stmt = (sql) => ({ bind: () => ({
    first: async () => (/FROM cloud_sessions/.test(sql) ? usuario : /FROM client_email_drafts/.test(sql) ? draft : null),
    run: async () => ({ meta:{ changes:1 } }),
  }) });
  const env = { RESEND_API_KEY:'teste', DB:{ prepare: stmt, batch: async () => [] }, ...extraEnv };
  let payload = null;
  const original = global.fetch;
  global.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ id:'resend-1' }); };
  try {
    const pdf = Buffer.from('%PDF-1.4 teste').toString('base64');
    const response = await worker.handleCommercialSync(new Request('https://exemplo.test/v1/client-email-draft/send', {
      method:'POST', headers:{ Authorization:'Bearer token-de-teste' },
      body:JSON.stringify({ costCenterPublicId:'11111111-1111-4111-8111-111111111111', attachments:[{ filename:'nota.pdf', contentType:'application/pdf', contentBase64:pdf }] }),
    }), env);
    return { response, payload };
  } finally { global.fetch = original; }
}

test('cobranca sai do dominio verificado com o nome de quem envia e Reply-To na conta logada', async () => {
  const { response, payload } = await enviar({ org_id:'org', email:'PCM@rcconstrutec.com.br', name:'Maria <Silva>', role:'gestor' });
  assert.equal(response.status, 200);
  assert.equal(payload.from, 'Maria Silva <cobranca@reports.rcconstrutec.com.br>');
  assert.equal(payload.reply_to, 'pcm@rcconstrutec.com.br');
});

test('CLIENT_EMAIL_ADDRESS troca o endereco e conta sem nome usa Construtec', async () => {
  const { payload } = await enviar({ org_id:'org', email:'pcm@rcconstrutec.com.br', name:'', role:'gestor' }, { CLIENT_EMAIL_ADDRESS:'financeiro@reports.rcconstrutec.com.br' });
  assert.equal(payload.from, 'Construtec <financeiro@reports.rcconstrutec.com.br>');
});

test('recusa do Resend volta como 422 com o motivo (o app mostra a mensagem)', async () => {
  const original = global.fetch;
  const wrap = global.fetch;
  void wrap;
  const worker = await import(require('node:url').pathToFileURL(path.join(__dirname, '..', 'cloudflare', 'center-container', 'commercialSync.js')).href);
  const draft = { status:'authorized', to_json:'["c@exemplo.com.br"]', cc_json:'[]', subject:'S', body_text:'Mensagem', authorized_at:'x', updated_at:'x' };
  const usuario = { org_id:'org', email:'pcm@rcconstrutec.com.br', name:'M', role:'gestor' };
  const stmt = (sql) => ({ bind: () => ({ first: async () => (/FROM cloud_sessions/.test(sql) ? usuario : /FROM client_email_drafts/.test(sql) ? draft : null), run: async () => ({ meta:{ changes:1 } }) }) });
  global.fetch = async () => Response.json({ message:'Dominio nao verificado' }, { status:403 });
  try {
    const pdf = Buffer.from('%PDF-1.4 t').toString('base64');
    const r = await worker.handleCommercialSync(new Request('https://exemplo.test/v1/client-email-draft/send', { method:'POST', headers:{ Authorization:'Bearer t' },
      body:JSON.stringify({ costCenterPublicId:'11111111-1111-4111-8111-111111111111', attachments:[{ filename:'n.pdf', contentType:'application/pdf', contentBase64:pdf }] }) }), { RESEND_API_KEY:'k', DB:{ prepare: stmt, batch: async () => [] } });
    assert.equal(r.status, 422);
    assert.match((await r.json()).error, /Dominio nao verificado/);
  } finally { global.fetch = original; }
});
