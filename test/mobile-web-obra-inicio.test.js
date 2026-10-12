const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', 'm', file), 'utf8');
const NOVOS = ['screen-obra-tec.js', 'screen-obra-curva.js', 'screen-obra-folha.js', 'screen-obra-importar.js', 'screen-home-mais.js', 'screen-busca.js', 'obra-tec.css'];

test('celular: arquivos novos da obra e do Inicio carregados pela pagina e guardados no service worker', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  for (const f of NOVOS) {
    assert.ok(html.includes(f.endsWith('.css') ? `href="${f}"` : `src="${f}"`), `${f} fora do index.html`);
    assert.ok(sw.includes(`'${f}'`), `${f} fora do cache`);
    const src = read(f);
    assert.ok(src.split('\n').length <= 350, `${f} passou de 350 linhas`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u);
  }
  assert.ok(Number((sw.match(/const CACHE = 'cc-celular-v(\d+)'/) || [])[1]) >= 15, 'cache trocado');
});

test('celular: abas Medicoes e Curva S na obra, com as mesmas rotas do desktop', () => {
  const obra = read('screen-obra.js');
  assert.match(obra, /\['nf', 'Notas fiscais'\], \['medicoes', 'Medições'\], \['curva', 'Curva S'\]/);
  assert.match(obra, /medicoes: 'obraMedicoes', curva: 'obraCurva'/);
  const med = read('screen-obra-tec.js');
  assert.match(med, /`\/centros-custo\/\$\{c\.id\}\/medicoes`, \{ method: 'POST', body \}/);
  assert.match(med, /CC\.sv\.can\('p12'\)/, 'lancar medicao segue a p12 do servidor');
  assert.match(med, /type: 'labor', periodStart, periodEnd, teamHours, notes/);
  assert.match(med, /type: 'contract', measurementNumber: n, periodStart, periodEnd, measuredAmount: valor, notes/);
  assert.match(med, /teamHours >= 0\.5/);
  assert.match(med, /CC\.go\('obra-folha', \{ id: c\.id, tipo: 'boletim'/);
  const curva = read('screen-obra-curva.js');
  assert.match(curva, /`\/centros-custo\/\$\{c\.id\}\/curva-s`/);
  assert.match(curva, /<svg class="cs-svg" viewBox="0 0 \$\{W\} \$\{H\}" role="img"/);
  assert.doesNotMatch(curva, /<script|chart\.js|d3/i, 'grafico sem biblioteca');
});

test('celular: relatorio executivo e boletim abrem em folha com imprimir, compartilhar e CSV', () => {
  const folha = read('screen-obra-folha.js');
  assert.match(folha, /CC\.screens\['obra-folha'\]/);
  assert.match(folha, /contentWindow\.print\(\)/);
  assert.match(folha, /navigator\.share\(\{ files: \[file\]/);
  assert.match(folha, /\/orcado-realizado\/csv`/);
  assert.match(folha, /Curva ABC do realizado/);
  assert.match(folha, /Boletim de medição contratual/);
  const app = read('app.js');
  assert.match(app, /'obra-editar', 'obra-folha', 'servico'/, 'folha fica na aba Obras');
  assert.ok(((app.match(/!\[([^\]]*)\]\.includes\(first\)/) || [])[1] || '').includes("'obra-folha'"), 'recarregar nao reabre a folha sem a obra');
  assert.match(read('screen-obra-acoes.js'), /CC\.go\('obra-folha', \{ id: c\.id, tipo: 'relatorio' \}\)/);
});

test('celular: importar orcamento (previa, confirmar, PDF) e vincular gastos com p5', () => {
  const imp = read('screen-obra-importar.js');
  assert.match(imp, /'\/integracao\/orcamentos\/previas', \{ method: 'POST'/);
  assert.match(imp, /options: \{ costCenterId: obraId \}/);
  assert.match(imp, /\/confirmar`, \{ method: 'POST', body: \{ hash: previa\.hash, costCenterId: destino \} \}/);
  assert.match(imp, /\/proposta`, \{ method: 'POST', body: \{ nome: pdf\.name, tipo: 'application\/pdf', conteudoBase64:/);
  assert.match(imp, /MAX_PDF = 5 \* 1024 \* 1024/);
  assert.match(imp, /\/apropriacoes`, \{ method: 'POST', body: \{ allocationId: card\.dataset\.gasto, contractId: cmp\.contract\.id, controlItemId: insumo \} \}/);
  const abas = read('screen-obra-abas.js');
  assert.match(abas, /CC\.sv\.can\('p5'\)/);
  assert.match(abas, /CC\.obraVincular\(c, cmp, recarregar\)/);
  assert.match(abas, /CC\.obraImportar\(c, recarregar\)/);
  assert.doesNotMatch(abas, /Vincule pelo computador/);
});

test('celular: Inicio com filtro de mes e obra, 6 indicadores, 12 meses, categorias e recentes', () => {
  const home = read('screen-home.js');
  const mais = read('screen-home-mais.js');
  assert.match(mais, /`\/dashboard\/resumo\?mes=\$\{mes\}&meses=12\$\{obra \? `&centroId=\$\{obra\}` : ''\}`/);
  for (const k of ['Recebido', 'Pago', 'Resultado', 'A receber', 'A pagar', 'Vencidos']) assert.ok(mais.includes(`['${k}'`), k);
  assert.match(mais, /Evolução · 12 meses/);
  assert.match(mais, /Despesas por categoria/);
  assert.match(mais, /CC\.wireTx\(slot, \['home'\]\)/, 'recentes abrem o detalhe do lancamento');
  assert.match(home, /CC\.homePainel\(CC\.\$\('#home-mais'\), dash, params\)/);
  assert.match(home, /tasksFrom\(dash, CC\.queue\.state\)/, 'pendencias do dia continuam no topo');
  // Carteira de obras com os numeros do desktop (portfolio-summary).
  assert.match(home, /'\/centros-custo\/portfolio-summary\?kind=obra'/);
  for (const k of ['Horas medidas', 'Faturado', 'Saldo']) assert.ok(mais.includes(`['${k}'`), k);
});

test('celular: busca global de obras e lancamentos abre a obra ou o lancamento', () => {
  const busca = read('screen-busca.js');
  assert.match(busca, /`\/lancamentos\?busca=\$\{encodeURIComponent\(q\)\}&limite=8&pagina=1`/);
  assert.match(busca, /CC\.go\(b\.dataset\.sv \? 'servico' : 'obra'/);
  assert.match(busca, /CC\.go\('lanc', \{ id: Number\(b\.dataset\.tx\)/);
  assert.match(busca, /q\.length < 2/);
  assert.match(read('screen-home.js'), /CC\.busca\(\['home'\]\)/);
});

// Executa os desenhos de verdade (sem DOM): texto da API sempre escapado e contas em centavos.
function sandbox() {
  const CC = { screens: {} };
  const ctx = { window: { CC }, location: { origin: 'http://x' }, navigator: {}, document: {}, console };
  vm.createContext(ctx);
  for (const f of ['icons.js', 'core.js', 'screen-lancamentos.js', 'screen-obra.js', 'screen-obra-tec.js', 'screen-obra-curva.js', 'screen-home-mais.js']) vm.runInContext(read(f), ctx, { filename: f });
  return ctx.window.CC;
}

test('celular: indicadores e graficos escapam o texto e somam em centavos', async () => {
  const CC = sandbox();
  const html = CC.tiles([['<b>x</b>', 'R$ 1', '<i>']]);
  assert.doesNotMatch(html, /<b>x<\/b>|<i>/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  // Painel do Inicio com dados do servidor desenhado num elemento falso.
  const slot = { innerHTML: '', isConnected: true, insertAdjacentHTML() {} };
  CC.$$ = () => []; CC.$ = () => ({ addEventListener() {} }); CC.wireTx = () => {};
  CC.mesNome = () => 'Outubro de 2026';
  const base = { receitas: 1000, despesas: 345.67, saldo: 654.33, aReceber: 0, aPagar: 120.4, vencidos: 120.4, qtdVencidos: 1, porCentro: [{ id: 1, nome: '<script>' }],
    porCategoria: [{ tipo: 'despesa', categoria: '<img>', total: '466.07' }], tendencia: [{ mes: '2026-10', receitas: 1000, despesas: 345.67 }],
    ultimosLancamentos: [{ id: 9, tipo: 'despesa', valor: '120.40', sinal_contabil: 1, descricao: 'Areia', favorecido: 'Deposito <b>X</b>', data: '2026-10-10' }] };
  await CC.homePainel(slot, base, null);
  assert.doesNotMatch(slot.innerHTML, /<script>|<img>|<b>X<\/b>/);
  assert.match(slot.innerHTML, /Deposito &lt;b&gt;X&lt;\/b&gt;/);
  assert.match(slot.innerHTML, /<svg class="cs-svg"/);
  assert.match(slot.innerHTML, /R\$\s654,33/);
});
