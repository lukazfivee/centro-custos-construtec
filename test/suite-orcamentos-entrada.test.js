// Entrada do Orçamentos pela sessão do Centro no navegador (public/entrar-orcamentos.js): o Orçamentos sem sessão
// manda para cá; volta com #handoff= quando a conta está logada aqui e com #centro=0 em qualquer outro caso.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORCAMENTOS = 'https://construtec-orcamentos-cloud.construtec-reports.workers.dev/';
const fonte = fs.readFileSync(path.join(__dirname, '..', 'public', 'entrar-orcamentos.js'), 'utf8');
const CODIGO = 'a'.repeat(40) + '_-9';

// Roda a página com o armazenamento e a resposta da rota simulados; devolve para onde ela mandou.
function abrir({ hash = '', token = 'jwt-do-centro', resposta } = {}) {
  return new Promise((resolve) => {
    const pedidos = [];
    const contexto = {
      URLSearchParams, AbortController,
      setTimeout: (fn, ms) => setTimeout(fn, ms).unref(), // o limite de 10 s não segura o fim do teste
      location: { hash, replace: (url) => resolve({ url, pedidos }) },
      localStorage: { getItem: (chave) => (chave === 'cc_token' ? token : null) },
      fetch: async (url, opcoes) => {
        pedidos.push({ url, opcoes });
        if (resposta instanceof Error) throw resposta;
        return { ok: resposta.status === 200, json: async () => resposta.body };
      },
    };
    vm.runInNewContext(fonte, contexto);
  });
}

test('conta logada no Centro volta para o Orçamentos com o código de uso único', async () => {
  const { url, pedidos } = await abrir({ resposta: { status: 200, body: { code: CODIGO } } });
  assert.equal(url, `${ORCAMENTOS}#handoff=${CODIGO}`);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, '/api/auth/suite-handoff');
  assert.equal(pedidos[0].opcoes.method, 'POST');
  assert.equal(pedidos[0].opcoes.headers.Authorization, 'Bearer jwt-do-centro');
  assert.deepEqual(JSON.parse(pedidos[0].opcoes.body), { target: 'orcamentos' });
});

test('a proposta pedida vai junto; id fora do formato fica de fora', async () => {
  const ok = await abrir({ hash: '#proposta=3f2a-11', resposta: { status: 200, body: { code: CODIGO } } });
  assert.equal(ok.url, `${ORCAMENTOS}#handoff=${CODIGO}&proposta=3f2a-11`);
  const ruim = await abrir({ hash: '#proposta=%3Cscript%3E', resposta: { status: 200, body: { code: CODIGO } } });
  assert.equal(ruim.url, `${ORCAMENTOS}#handoff=${CODIGO}`);
});

test('sem sessão, conta local, sessão vencida, resposta estranha ou sem rede: volta para o login do Orçamentos', async () => {
  const semToken = await abrir({ token: '' });
  assert.equal(semToken.url, `${ORCAMENTOS}#centro=0`);
  assert.equal(semToken.pedidos.length, 0, 'sem sessão não chama a rota');
  for (const resposta of [{ status: 409, body: { erro: 'conta local' } }, { status: 401, body: {} }, { status: 200, body: { code: 'curto' } }, new Error('sem rede')]) {
    assert.equal((await abrir({ hash: '#proposta=abc', resposta })).url, `${ORCAMENTOS}#centro=0&proposta=abc`);
  }
});

test('a página carrega só o script dela e o destino não vem do endereço', () => {
  const pagina = fs.readFileSync(path.join(__dirname, '..', 'public', 'entrar-orcamentos.html'), 'utf8');
  assert.match(pagina, /<script src="entrar-orcamentos\.js"><\/script>/);
  assert.equal((pagina.match(/<script/g) || []).length, 1);
  assert.doesNotMatch(fonte, /location\.(search|href)|get\('(volta|url|destino)'\)/, 'sem redirecionamento aberto');
});
