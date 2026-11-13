// Celular: tela Logistica do escritorio (gestor) com as mesmas abas, rotas e permissao do desktop
// (public/d/telas/logistica*.js, routes/logistica.js e routes/logisticaMateriais.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, 'public', 'm', file), 'utf8');
const route = (file) => fs.readFileSync(path.join(ROOT, 'routes', file), 'utf8');
const ARQUIVOS = ['screen-logistica-base.js', 'screen-logistica.js', 'screen-logistica-ferramental.js', 'screen-logistica-ferramental-acoes.js',
  'screen-logistica-estoque.js', 'screen-logistica-pendencias.js'];
const tudo = () => ARQUIVOS.map(read).join('\n');

test('celular: logística do escritório carregada, no cache e dona da aba Menu', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const app = read('app.js');
  for (const f of ARQUIVOS) {
    assert.ok(html.includes(`"${f}"`), `${f} fora do index.html`);
    assert.ok(sw.includes(`'${f}'`), `${f} fora do sw.js`);
    assert.ok(read(f).split('\n').length <= 350, `${f} passou de 350 linhas`);
  }
  assert.match(sw, /const CACHE = 'cc-celular-v43'/);
  // A ordem importa: pecas comuns antes das abas, e tudo depois de fin-base.js, screen-adm.js e das folhas (screen-obra-acoes.js).
  const pos = (f) => html.indexOf(`"${f}"`);
  for (const f of ARQUIVOS.slice(1)) assert.ok(pos(f) > pos(ARQUIVOS[0]), `${f} antes das peças comuns`);
  for (const base of ['fin-base.js', 'screen-adm.js', 'screen-obra-acoes.js']) assert.ok(pos(ARQUIVOS[0]) > pos(base), `peças comuns antes de ${base}`);
  assert.match(read('screen-logistica.js'), /CC\.screens\.logistica = async function \(params\)/);
  const menu = (app.match(/\['menu', 'Menu', 'list', \[([^\]]*)\]\]/) || [])[1] || '';
  assert.ok(menu.includes("'logistica'"), 'logistica fora da aba Menu');
  // Tela de gestor: o tecnico nao abre (fora do conjunto campo).
  const campo = (app.match(/const campo = new Set\(\[([^\]]*)\]\)/) || [])[1] || '';
  assert.ok(campo.includes("'meu-kit'") && !campo.includes("'logistica'"), 'logistica liberada para o técnico');
});

test('celular: logística exige p5 no Menu, na tela e no servidor', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'public', 'd', 'd-core.js'), 'utf8'), /logistica: \(\) => D\.tem\('p5'\)/);
  const adm = read('screen-adm.js');
  assert.match(adm, /\['logistica', 'p5', 'wrench', 'Logística'/);
  assert.match(adm, /ITENS\.filter\(\(\[k, p\]\) => CC\.screens\[k\] && \(!p \|\| A\.can\(p\)\)\)/);
  assert.match(read('screen-logistica.js'), /if \(!\(await A\.guard\(params, 'p5', 'Logística'\)\)\) return undefined;/);
  for (const f of ['logistica.js', 'logisticaMateriais.js']) assert.match(route(f), /const manager = exigirPermissao\('p5'\)/, f);
});

test('celular: logística tem as cinco abas e cada ação usa a rota do servidor', () => {
  const casca = read('screen-logistica.js');
  assert.match(casca, /\['resumo', 'Resumo'\], \['ferramental', 'Ferramental'\], \['materiais', 'Materiais'\], \['pendencias', 'Pendências'\], \['historico', 'Histórico'\]/);
  const fonte = tudo();
  for (const aba of ['resumo', 'ferramental', 'materiais', 'pendencias', 'historico']) assert.ok(fonte.includes(`L.modulos.${aba} = {`), `aba ${aba} sem módulo`);
  const srv = `${route('logistica.js')}\n${route('logisticaMateriais.js')}`;
  // [metodo no servidor, rota no servidor, trecho da chamada no celular]
  const ACOES = [
    ['post', '/entregas', "rota: '/logistica/entregas'"],
    ['post', '/conferencias-iniciais', "rota: '/logistica/conferencias-iniciais'"],
    ['post', '/ferramentas', "CC.api('/logistica/ferramentas', { method: 'POST'"],
    ['put', '/kits/padrao', "CC.api('/logistica/kits/padrao', { method: 'PUT'"],
    ['post', '/ferramentas/:id/devolucao', "/devolucao`, { method: 'POST'"],
    ['post', '/ferramentas/:id/avaliacao', "/avaliacao`, { method: 'POST'"],
    ['get', '/ferramentas/:id/historico', '/historico`)'],
    ['post', '/faltas/:id/apuracao', "/apuracao`, { method: 'POST'"],
    ['post', '/entregas/:id/revisao', "/revisao`, { method: 'POST'"],
    ['get', '/entregas/:id', '`/logistica/entregas/${encodeURIComponent(id)}`)'],
    ['post', '/materiais/entregas', "CC.api('/logistica/materiais/entregas', { method: 'POST'"],
    ['post', '/materiais/entradas', "CC.api('/logistica/materiais/entradas', { method: 'POST'"],
    ['post', '/materiais', "CC.api('/logistica/materiais', { method: 'POST'"],
    ['post', '/materiais/devolucoes', "CC.api('/logistica/materiais/devolucoes', { method: 'POST'"],
  ];
  for (const [metodo, rota, chamada] of ACOES) {
    assert.ok(srv.includes(`router.${metodo}('${rota}',`), `servidor sem ${metodo} ${rota}`);
    assert.ok(fonte.includes(chamada), `celular sem a chamada de ${metodo} ${rota}`);
  }
  // Leituras das abas: cada endereco de L.API existe no servidor.
  const api = (read('screen-logistica-base.js').match(/L\.API = \{([\s\S]*?)\};/) || [])[1] || '';
  const leituras = [...api.matchAll(/'\/logistica(\/[^']+)'/g)].map((m) => m[1]);
  assert.equal(leituras.length, 11);
  for (const rota of leituras) assert.ok(srv.includes(`router.get('${rota}',`), `servidor sem get ${rota}`);
  assert.match(fonte, /CC\.api\('\/logistica\/tecnicos'\)/);
});

test('celular: logística segue o padrão do /m/ (folhas, erro com campo, recarga da aba, offline)', () => {
  const base = read('screen-logistica-base.js');
  const casca = read('screen-logistica.js');
  const fonte = tudo();
  assert.match(base, /CC\.sheet\('lg-sheet'/);
  assert.match(base, /CC\.sheetErr\(error\)/);
  assert.match(base, /CC\.busy\(botao, 'Salvando…'\)/);
  assert.match(base, /L\.falha = \(campo, mensagem\) => Object\.assign\(new Error\(mensagem\), \{ campo \}\)/);
  assert.match(base, /alvo\.focus\(\)/);
  // Depois de salvar: mesma aba, dados lidos de novo.
  assert.match(casca, /atualizar: \(\) => \{ cache = \{\}; salvos = \{\}; return mostrar\(\); \}/);
  assert.ok((fonte.match(/feito: ctx\.atualizar/g) || []).length >= 8);
  assert.match(casca, /CC\.cached\(`logi-\$\{chave\}`, L\.API\[chave\]\)/);
  assert.match(casca, /CC\.staleNote\(/);
  assert.match(casca, /Tentar de novo/);
  assert.match(casca, /F\.top\('Logística'/);
  // Entregas, entradas e devolucoes levam client_id estavel enquanto os dados nao mudam.
  assert.ok((fonte.match(/body: selo\(/g) || []).length >= 4);
  assert.match(base, /inputmode="decimal"/);
  assert.doesNotMatch(fonte, /\p{Extended_Pictographic}/u);
  // So icones que existem em icons.js.
  const icones = fs.readFileSync(path.join(ROOT, 'public', 'm', 'icons.js'), 'utf8');
  const usados = new Set([...fonte.matchAll(/(?:icon\(|icone: |sheetHead\(|folhaInfo\(|vazio\(|^\s*\[)'([a-z][a-z-]+)',/gm)].map((m) => m[1]));
  for (const nome of ['wrench', 'archive', 'download-simple', 'list-checks', 'arrow-counter-clockwise', 'plus', 'check-circle']) assert.ok(usados.has(nome), `${nome} não encontrado`);
  for (const nome of usados) assert.ok(icones.includes(`"${nome}":`), `ícone ${nome} não existe em icons.js`);
  // Impressao da ficha em papel fica no computador.
  assert.doesNotMatch(fonte, /window\.print/);
});
