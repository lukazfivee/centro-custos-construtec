const test = require('node:test');
const assert = require('node:assert/strict');

// Sessao entregue pelo app (hash:...) precisa da chave compartilhada; 401 da nuvem nao pode derrubar a sessao local.
test('cobrancas: sessao hash: leva x-sync-key e 401 da nuvem vira 409', async () => {
  const db = require('../db');
  const originalIdentity = db.getInstanceIdentity;
  const originalFetch = global.fetch;
  const originalUrl = process.env.SYNC_API_URL;
  const originalKey = process.env.SYNC_SHARED_KEY;
  db.getInstanceIdentity = () => ({ id:'00000000-0000-4000-8000-000000000010', name:'Teste' });
  process.env.SYNC_API_URL = 'https://cloud.test';
  process.env.SYNC_SHARED_KEY = 'k'.repeat(40);
  let enviados;
  global.fetch = async (url, options) => { enviados = options.headers; return new Response('{"error":"Sessao invalida."}', { status:401, headers:{ 'content-type':'application/json' } }); };
  delete require.cache[require.resolve('../services/cloudSync')];
  const cloud = require('../services/cloudSync');
  try {
    await assert.rejects(
      cloud.listClientFollowups({ email:'a@rcconstrutec.com.br', cloud_session_token:`hash:${'a'.repeat(64)}` }),
      (error) => error.statusCode === 409
    );
    assert.equal(enviados['x-sync-key'], 'k'.repeat(40));
    await assert.rejects(cloud.listClientFollowups({ email:'a@rcconstrutec.com.br', cloud_session_token:'' }), (error) => error.statusCode !== 401);
  } finally {
    db.getInstanceIdentity = originalIdentity;
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SYNC_API_URL; else process.env.SYNC_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SYNC_SHARED_KEY; else process.env.SYNC_SHARED_KEY = originalKey;
    delete require.cache[require.resolve('../services/cloudSync')];
  }
});
