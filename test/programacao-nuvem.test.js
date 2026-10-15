const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bridge(api) {
  let token = 'sessao-a';
  const redirects = [], calls = [];
  const context = { URL, location: { assign: (url) => redirects.push(url) }, CC: {
    session: { token: () => token }, api: async (...args) => { calls.push(args); return api(); },
  } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/m/programacao-nuvem.js'), 'utf8'), context);
  return { CC: context.CC, redirects, calls, change: () => { token = 'sessao-b'; } };
}

test('ponte abre a agenda central com código descartável e mantém contas locais', async () => {
  const url = 'https://agenda.example/d/?programacao=1#handoff=code';
  const m = bridge(async () => ({ data: { url } }));
  assert.equal(await m.CC.programacaoNuvem(), true);
  assert.deepEqual(m.redirects, [url]);
  assert.equal(m.calls[0][0], '/programacao/abrir-nuvem');
  assert.equal(m.calls[0][1].method, 'POST');
  const local = bridge(async () => ({ data: { url: null } }));
  assert.equal(await local.CC.programacaoNuvem(), false);
  assert.deepEqual(local.redirects, []);
});

test('ponte não redireciona uma sessão ou tela que mudou durante a consulta', async () => {
  let release;
  const m = bridge(() => new Promise((resolve) => { release = resolve; }));
  const pending = m.CC.programacaoNuvem();
  m.change(); release({ data: { url: 'https://agenda.example/m/#handoff=code' } });
  assert.equal(await pending, true); assert.deepEqual(m.redirects, []);
  const stale = bridge(async () => ({ data: { url: 'https://agenda.example/m/' } }));
  assert.equal(await stale.CC.programacaoNuvem(() => false), true);
  assert.deepEqual(stale.redirects, []);
});

test('Windows abre a agenda no navegador e preserva a origem e sessão da Suíte', async () => {
  const url = 'https://agenda.example/d/?programacao=1#handoff=code';
  const m = bridge(async () => ({ data: { url } }));
  const opened = [];
  // A mesma API de abertura é interceptada pelo setWindowOpenHandler da Suíte.
  const source = fs.readFileSync(path.join(__dirname, '../public/m/programacao-nuvem.js'), 'utf8');
  const context = { URL, CC: m.CC, electronAPI: {}, open: (...args) => opened.push(args),
    location: { assign: () => assert.fail('Não pode trocar a origem do Centro na Suíte') } };
  context.window = context; vm.runInNewContext(source, context);
  const button = { addEventListener() {} };
  const slot = { innerHTML: '', querySelector: () => button };
  assert.equal(await context.CC.programacaoNuvem(() => true, slot), true);
  assert.deepEqual(opened, [[url, '_blank', 'noopener,noreferrer']]);
  assert.match(slot.innerHTML, /navegador/);
  assert.match(slot.innerHTML, /Abrir novamente/);
});

test('ponte rejeita endereço inseguro e mantém erros corporativos; falta de rede permite cache', async () => {
  for (const url of ['javascript:alert(1)', 'http://agenda.example/m/', 'https://user:pass@agenda.example/m/']) {
    const m = bridge(async () => ({ data: { url } }));
    await assert.rejects(m.CC.programacaoNuvem(), /seguro/); assert.deepEqual(m.redirects, []);
  }
  for (const status of [403, 428, 503]) {
    const error = Object.assign(new Error('Falha corporativa'), { status });
    await assert.rejects(bridge(async () => { throw error; }).CC.programacaoNuvem(), { status });
  }
  assert.equal(await bridge(async () => { throw { status: 0 }; }).CC.programacaoNuvem(), false);
});
