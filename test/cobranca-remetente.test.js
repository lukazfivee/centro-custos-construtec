const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// O e-mail de cobranca sai com o nome e o e-mail de quem esta logado; CLIENT_EMAIL_FROM nao e mais obrigatorio.
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

test('remetente da cobranca e a conta logada, sem CLIENT_EMAIL_FROM', async () => {
  const { response, payload } = await enviar({ org_id:'org', email:'PCM@rcconstrutec.com.br', name:'Maria <Silva>', role:'gestor' });
  assert.equal(response.status, 200);
  assert.equal(payload.from, 'Maria Silva <pcm@rcconstrutec.com.br>');
});

test('sem e-mail corporativo valido usa CLIENT_EMAIL_FROM e, sem ele, recusa com 503', async () => {
  const usuario = { org_id:'org', email:'fora@gmail.com', name:'X', role:'gestor' };
  assert.equal((await enviar(usuario)).response.status, 503);
  const com = await enviar(usuario, { CLIENT_EMAIL_FROM:'financeiro@rcconstrutec.com.br' });
  assert.equal(com.payload.from, 'financeiro@rcconstrutec.com.br');
});
