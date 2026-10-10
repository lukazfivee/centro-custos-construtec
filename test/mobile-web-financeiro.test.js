// Celular: Cobrancas, Recorrentes, Fornecedores e Categorias com as mesmas rotas do desktop e as
// permissoes do servidor (routes/cloudSync.js, recurring.js, suppliers.js, categories.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, 'public', 'm', file), 'utf8');
const route = (file) => fs.readFileSync(path.join(ROOT, 'routes', file), 'utf8');

test('celular: telas novas carregadas, no cache e donas da aba Menu', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const app = read('app.js');
  for (const f of ['fin.css', 'fin-base.js', 'cobr-regras.js', 'screen-cobrancas.js', 'screen-cobranca.js', 'screen-cobranca-dados.js', 'screen-cobranca-email.js',
    'screen-recorrentes.js', 'screen-recorrente-form.js', 'screen-fornecedores.js', 'screen-fornecedor-form.js', 'screen-categorias.js']) {
    assert.ok(html.includes(`"${f}"`), `${f} fora do index.html`);
    assert.ok(sw.includes(`'${f}'`), `${f} fora do sw.js`);
  }
  for (const s of ['cobrancas', 'cobranca', 'recorrentes', 'recorrente', 'fornecedores', 'fornecedor', 'categorias', 'categoria']) assert.ok(app.includes(`'${s}'`), s);
  // Detalhes e formularios precisam dos dados da lista: nao abrem direto pelo endereco.
  assert.match(app, /'obra-editar',\s*'cobranca', 'cobranca-dados', 'cobranca-email', 'recorrente', 'fornecedor', 'categoria'\]\.includes\(first\)/);
  assert.match(read('screen-misc.js'), /CC\.fin\.menu\(CC\.\$\('#m-fin', el\)\)/);
});

test('celular: Menu mostra cada item so para quem tem a permissao', () => {
  const base = read('fin-base.js');
  assert.match(base, /F\.corporativo = \(\) => \/@rcconstrutec\\\.com\\\.br\$\/i/);
  assert.match(base, /F\.podeCobrancas = \(\) => F\.corporativo\(\) && F\.can\('p6'\)/);
  assert.match(base, /F\.podeCadastrar = \(\) => F\.can\('p5'\)/);
  assert.match(base, /F\.podeCobrancas\(\) \? item\('cobrancas'/);
  assert.match(base, /F\.podeCadastrar\(\) \? item\('recorrentes'/);
  assert.match(base, /CC\.sv\.loadPerms\(\)/); // permissoes reais de /auth/me
});

test('celular: cobrancas usam as rotas do servidor com p6 e p7', () => {
  const srv = route('cloudSync.js');
  for (const [m, r, p] of [['get', "'/cobrancas'", 'p6'], ['post', "'/cobrancas/:publicId/excluir'", 'p6'], ['post', "'/cobrancas/:publicId/restaurar'", 'p6'],
    ['put', "'/cobrancas/:publicId'", 'p6'], ['put', "'/cobrancas/:publicId/rascunho'", 'p6'], ['post', "'/cobrancas/:publicId/autorizar'", 'p7'], ['post', "'/cobrancas/:publicId/enviar'", 'p7']]) {
    assert.ok(srv.includes(`router.${m}(${r}, exigirPermissao('${p}')`), `${m} ${r} ${p}`);
  }
  const regras = read('cobr-regras.js');
  assert.match(regras, /CC\.api\('\/cloud-sync\/cobrancas'\)/);
  assert.match(regras, /CC\.api\('\/cloud-sync\/cobrancas\?excluidas=1'\)/);
  assert.match(regras, /B\.url = \(i, acao\) => `\/cloud-sync\/cobrancas\/\$\{encodeURIComponent\(i\.publicId\)\}/);
  assert.match(regras, /CC\.api\(B\.url\(i\), \{ method: 'PUT', body: B\.corpo\(i, mudancas\) \}\)/);
  assert.match(regras, /timeZone: 'America\/Sao_Paulo'/);
  assert.match(read('screen-cobranca.js'), /B\.url\(item, 'excluir'\), \{ method: 'POST', body: \{ motivo:/);
  assert.match(read('screen-cobranca.js'), /const pode = F\.can\('p6'\)/);
  assert.match(read('screen-cobrancas.js'), /B\.url\(\{ publicId: b\.dataset\.restaurar \}, 'restaurar'\), \{ method: 'POST', body: \{\} \}/);
  const email = read('screen-cobranca-email.js');
  assert.match(email, /const envia = F\.can\('p7'\)/);
  assert.match(email, /`\$\{base\}\/rascunho`, \{ method: 'PUT', body: v \}/);
  assert.match(email, /`\$\{base\}\/autorizar`, \{ method: 'POST', body: \{ confirmar: true \} \}/);
  assert.match(email, /`\$\{base\}\/enviar`, \{ method: 'POST', body: \{ attachments: anexos \} \}/);
  assert.match(email, /5 \* 1024 \* 1024/);
});

test('celular: recorrentes, fornecedores e categorias com as rotas e o p5 do servidor', () => {
  const rec = route('recurring.js');
  for (const r of ["router.post('/', exigirPermissao('p5')", "router.put('/:id', exigirPermissao('p5')", "router.delete('/:id', exigirPermissao('p5')", "router.post('/gerar', exigirPermissao('p5')"]) assert.ok(rec.includes(r), r);
  const lista = read('screen-recorrentes.js');
  assert.match(lista, /CC\.api\(`\/recorrentes\/previa\?mes=\$\{mes\}`\)/);
  assert.match(lista, /CC\.api\('\/recorrentes\/gerar', \{ method: 'POST', body: \{ mes: previa\.mes, planToken: previa\.planToken \} \}\)/);
  assert.match(lista, /F\.corpoRecorrente\(m, \{ ativo: !m\.ativo \}\)/);
  const form = read('screen-recorrente-form.js');
  assert.match(form, /CC\.api\(`\/recorrentes\/proxima\?\$\{q\}`\)/);
  assert.match(form, /`\/recorrentes\/\$\{m\.id\}`, \{ method: 'DELETE' \}/);
  assert.match(form, /cost_center_id: Number\(v\('rf-obra'\)\), category_id: Number\(v\('rf-cat'\)\)/);
  for (const [file, r] of [['suppliers.js', "router.post('/', exigirPermissao('p5')"], ['suppliers.js', "router.put('/:id', exigirPermissao('p5')"],
    ['categories.js', "router.post('/', exigirPermissao('p5')"], ['categories.js', "router.put('/:id', exigirPermissao('p5')"]]) assert.ok(route(file).includes(r), `${file} ${r}`);
  assert.match(read('screen-fornecedores.js'), /F\.csvDaApi\('\/fornecedores\/exportar\.csv', 'fornecedores\.csv'\)/);
  assert.match(read('screen-fornecedor-form.js'), /`\/fornecedores\/\$\{f\.id\}\/resumo\?mes=\$\{mes\}`/);
  const cats = read('screen-categorias.js');
  assert.match(cats, /`\/categorias\/\$\{cat\.id\}`, \{ method: 'PUT', body \}/);
  // Mesma paleta que o servidor aceita.
  const cores = route('categories.js').match(/const CORES = (\[[^\]]+\])/)[1];
  assert.ok(cats.includes(`const CORES = ${cores}`));
});

test('celular: telas financeiras escapam o texto vindo da API', () => {
  for (const f of ['screen-cobrancas.js', 'screen-cobranca.js', 'screen-cobranca-dados.js', 'screen-cobranca-email.js', 'screen-recorrentes.js',
    'screen-recorrente-form.js', 'screen-fornecedores.js', 'screen-fornecedor-form.js', 'screen-categorias.js', 'cobr-regras.js', 'fin-base.js']) {
    const src = read(f);
    const raw = [...src.matchAll(/(?:>|=")\$\{(?:i|m|f|c|l|d|n|item|cat)\.(?:name|nome|code|clientName|client|invoiceNumber|descricao|favorecido|documento|contato|email|telefone|obra|deletedReason|deletedByEmail|notes|subject|nomeArquivo|observacao|centro_nome)\b/g)];
    assert.equal(raw.length, 0, `${f}: ${raw.map((x) => x[0]).join(', ')}`);
  }
});
