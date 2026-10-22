// Celular com as telas de administracao do desktop: fechamento (p8), historico, usuarios e sistema (p9)
// e reports (todos). Mesmas rotas do servidor; o celular so esconde o que o papel nao pode.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', 'm', file), 'utf8');
const ARQUIVOS = ['screen-adm.js', 'screen-fechamento.js', 'screen-historico.js', 'screen-reports.js', 'screen-report-novo.js',
  'screen-usuarios.js', 'screen-usuario-form.js', 'screen-papeis.js', 'screen-sistema.js', 'adm.css'];

test('celular: telas de administracao carregadas, guardadas offline e donas da aba Menu', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  for (const f of ARQUIVOS) {
    assert.ok(html.includes(f.endsWith('.css') ? `href="${f}"` : `src="${f}"`), `${f} fora do index.html`);
    assert.ok(sw.includes(`'${f}'`), `${f} fora do service worker`);
  }
  // screen-adm.js embrulha CC.sv.can e CC.isAdmin: precisa vir depois de screen-servico.js e screen-pedidos.js.
  assert.ok(html.indexOf('screen-adm.js') > html.indexOf('screen-pedidos.js'));
  assert.ok(html.indexOf('screen-adm.js') > html.indexOf('screen-servico.js'));
  const app = read('app.js');
  for (const k of ['fechamento', 'historico', 'reports', 'usuarios', 'papeis', 'emails-ext', 'sistema']) assert.ok(app.includes(`'${k}'`), k);
  assert.match(app, /'report', 'usuario-form'\]\.includes\(first\)/); // detalhes nao abrem direto pelo endereco
});

test('celular: Menu mostra cada item so para quem tem a permissao do desktop', () => {
  const adm = read('screen-adm.js');
  assert.match(adm, /\['fechamento', 'p8'/);
  assert.match(adm, /\['usuarios', 'p9'/);
  assert.match(adm, /\['historico', 'p9'/);
  assert.match(adm, /\['sistema', 'p9'/);
  assert.match(adm, /\['reports', null/);
  assert.match(adm, /CC\.sv\.loadPerms\(\)/);
  const menu = read('screen-misc.js');
  assert.match(menu, /CC\.adm\.menuHtml\(\)/);
  assert.match(menu, /CC\.adm\.wireMenu\(el\)/);
  assert.doesNotMatch(menu, /id="m-pedidos"/); // pedidos de acesso agora ficam dentro de Usuarios
  assert.match(read('screen-usuarios.js'), /CC\.go\('pedidos', \{ from: 'usuarios' \}\)/);
  assert.match(read('screen-pedidos.js'), /CC\.go\(params\.from \|\| 'menu'\)/);
  for (const [f, p] of [['screen-fechamento.js', 'p8'], ['screen-historico.js', 'p9'], ['screen-usuarios.js', 'p9'], ['screen-usuario-form.js', 'p9'], ['screen-papeis.js', 'p9'], ['screen-sistema.js', 'p9']]) {
    assert.match(read(f), new RegExp(`A\\.guard\\(params, '${p}'`), f);
  }
});

test('celular: fechamento usa resumo, checklist, fechar com pendencias e reabrir com motivo', () => {
  const f = read('screen-fechamento.js');
  assert.match(f, /`\/fechamento-mensal\/resumo\?ano=\$\{ano\}`/);
  assert.match(f, /`\/fechamento-mensal\/checklist\?ano=\$\{ano\}&mes=\$\{mes\}`/);
  assert.match(f, /CC\.api\('\/fechamento-mensal', \{ method: 'POST', body: \{ ano, mes, pendencias: pend \} \}\)/);
  assert.match(f, /`\/fechamento-mensal\/\$\{m\.fechamento_id\}`, \{ method: 'DELETE', body: \{ motivo \} \}/);
  assert.match(f, /const MOTIVO_MINIMO = 10;/); // igual ao servidor
  assert.match(f, /CC\.queue\.mine\(\)/); // a fila do celular entra no checklist
});

test('celular: historico com filtros, carregar mais, antes e depois e CSV', () => {
  const h = read('screen-historico.js');
  for (const k of ["'tipo'", "'usuario'", "'de'", "'ate'", "'busca'"]) assert.ok(h.includes(k), k);
  assert.match(h, /'\/historico\/pessoas'/);
  assert.match(h, /`\/historico\?\$\{query\(f, memo\.pagina \+ 1\)\}`/);
  assert.match(h, /A\.baixar\(`\/historico\/exportar\.csv\?/);
  assert.match(h, /O histórico não pode ser editado nem apagado/);
});

test('celular: reports com indicadores, detalhe, responder, reenviar e novo report sem o assistente', () => {
  const r = read('screen-reports.js');
  assert.match(r, /CC\.api\('\/bug-reports'\)/);
  assert.match(r, /`\/bug-reports\/\$\{r\.id\}`, \{ method: 'PUT', body: \{ resposta: texto \} \}/);
  assert.match(r, /`\/bug-reports\/\$\{id\}\/retry`, \{ method: 'POST'/);
  assert.match(r, /\['admin', 'gestor'\]\.includes\(A\.papelReal\(\)\)/); // mesma regra do servidor
  const n = read('screen-report-novo.js');
  assert.match(n, /CC\.api\('\/bug-reports', \{ method: 'POST', body \}\)/);
  assert.match(n, /client_id: clientId/);
  // "Incluir diagnóstico" é um interruptor (role="switch"), igual ao desktop (CC-10).
  assert.match(n, /diagnostico: CC\.\$\('#rn-diag', el\)\.getAttribute\('aria-checked'\) === 'true' \? A\.diag\(\) : null/);
  assert.match(n, /4 \* 1024 \* 1024/);
  assert.match(read('screen-misc.js'), /CC\.ia\.open\('Quero reportar um problema no app\.'\)/); // o envio pelo assistente continua
  const adm = read('screen-adm.js');
  assert.match(adm, /!\/\\d\/\.test\(bruto\)/); // rotulo com numero (pode ser valor) nao entra no diagnostico
});

test('celular: usuarios, acesso, senha provisoria, matriz e ver o sistema como', () => {
  const u = read('screen-usuarios.js');
  assert.match(u, /`\/usuarios\/\$\{u\.id\}\/status`, \{ method: 'PUT', body: \{ ativo: !ativo \} \}/);
  assert.match(u, /'\/cadastros\/convites'/);
  const f = read('screen-usuario-form.js');
  assert.match(f, /`\/usuarios\/\$\{id\}\/acesso`, \{ method: 'PUT', body: \{ suiteRole: st\.papel, apps: st\.apps, obras: obrasCorpo \} \}/);
  assert.match(f, /CC\.api\('\/usuarios', \{ method: 'POST', body: \{ nome, email, senha, suiteRole/);
  assert.match(f, /senha\.length < 10/);
  const p = read('screen-papeis.js');
  assert.match(p, /'\/usuarios\/permissoes', \{ method: 'POST', body: \{ papel: p, permissao/);
  assert.match(p, /'\/usuarios\/permissoes\/restaurar'/);
  assert.match(p, /'\/usuarios\/emails-autorizados\/lista'/);
  assert.match(p, /'\/usuarios\/emails-autorizados\/revogar'/);
  const adm = read('screen-adm.js');
  assert.match(adm, /sessionStorage\.setItem\(CHAVE_COMO/); // so nesta aba do aparelho
  assert.match(adm, /realCan\('p9'\)/); // so quem administra usuarios simula
});

test('celular: sistema le status real e nao oferece backup que a nuvem nao tem', () => {
  const s = read('screen-sistema.js');
  assert.match(s, /CC\.api\('\/sistema\/status'\)/);
  assert.match(s, /CC\.api\('\/backup\/copias'\)/);
  assert.doesNotMatch(s, /\/backup\/restaurar|method: 'POST'/);
});
