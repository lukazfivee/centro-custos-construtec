// C5: Inicio e Lancamentos. Reutiliza catalogo, motor e dados ficticios do C1.
require('./c5-isolamento');
const assert = require('node:assert/strict');
const path = require('node:path');
const { catalogo, t } = require('./telas');
const cdp = require('./cdp');
const pasta = path.resolve(__dirname, '../../docs/suite-desktop/validacao/C5');
catalogo.splice(0, catalogo.length, ...catalogo.filter(x => ['D1', 'D2'].includes(x.grupo)));

async function conferir(c, expressao, mensagem) {
  assert.ok(await c.esperar(expressao, 8000), mensagem);
}
async function novo(c) { await c.tocar('[data-novo]'); await c.painel(); }
async function buscar(c, texto) {
  await c.digitar('[data-f="busca"]', texto);
  await c.dormir(1100);
  await conferir(c, 'document.querySelector("tr.rw")', 'Busca nao carregou');
}
async function editar(c) {
  await buscar(c, 'Locação de plataforma');
  await c.tocarTexto('tr.rw', 'Locação de plataforma'); await c.painel();
}
async function estorno(c) {
  await buscar(c, 'Compra avulsa 2');
  await c.linha('Compra avulsa 2', 'estornar'); await c.painel();
}
async function fim(c) {
  await c.rolar('.drawer .dcorpo', 'fim');
  await conferir(c, `(() => {
    const e = document.querySelector('.drawer .dcorpo');
    return e.scrollTop + e.clientHeight >= e.scrollHeight - 3;
  })()`, 'Fim do painel inacessivel');
}
for (const sit of ['pendentes', 'vencidos', 'pagos', 'a_receber', 'recebidos']) {
  t('D2', `filtro-${sit}`, { rota: 'lancamentos', ref: 'lanc', async preparar(c) {
    await c.tocar(`[data-seg="sit"][data-valor="${sit}"]`); await c.dormir(900);
    await conferir(c, `document.querySelector('[data-seg="sit"][data-valor="${sit}"]')?.getAttribute('aria-pressed') === 'true'`, 'Filtro nao aplicado');
  } });
}
for (const tipo of ['receita', 'despesa']) {
  t('D2', `tipo-${tipo}`, { rota: 'lancamentos', ref: 'lanc', async preparar(c) {
    await c.tocar(`[data-seg="tipo"][data-valor="${tipo}"]`); await c.dormir(900);
  } });
}
t('D2', 'busca-vazia', { rota: 'lancamentos', ref: 'lanc', async preparar(c) {
  await c.digitar('[data-f="busca"]', 'sem-resultado-c5');
  await conferir(c, 'document.querySelector("[data-tabela]").textContent.includes("Nenhum lançamento")', 'Estado vazio ausente');
} });
t('D2', 'filtros-periodo', { rota: 'lancamentos', ref: 'lanc', async preparar(c) {
  await c.tocar('[data-mais]'); await c.digitar('[data-f="mes"]', ''); await c.dormir(900);
  await c.digitar('[data-f="de"]', `${c.s.mes}-01`); await c.dormir(900);
  await c.digitar('[data-f="ate"]', `${c.s.mes}-28`); await c.dormir(900);
  assert.ok(await c.avaliar('!document.querySelector("[data-f=de]").disabled'));
} });
t('D2', 'lista-final', { rota: 'lancamentos', ref: 'lanc', preparar: c => c.rolar('#conteudo', 'fim') });
t('D2', 'novo-final', { rota: 'lancamentos', ref: 'novo', async preparar(c) { await novo(c); await fim(c); } });
t('D2', 'novo-receita-recebida', { rota: 'lancamentos', ref: 'novo', async preparar(c) {
  await novo(c); await c.tocar('.drawer [data-seg="tipo"][data-valor="receita"]');
  await c.tocar('.drawer [data-seg="status"][data-valor="liquidado"]');
  await conferir(c, 'document.querySelector(".drawer [name=data_liquidacao]")', 'Data de recebimento ausente');
  await fim(c);
} });
t('D2', 'editar-final', { rota: 'lancamentos', ref: 'editar', async preparar(c) { await editar(c); await fim(c); } });
t('D2', 'editar-validacao', { rota: 'lancamentos', ref: 'erro', async preparar(c) {
  await editar(c); await c.digitar('.drawer [name="descricao"]', ''); await c.tocar('.drawer [data-salvar]');
  await conferir(c, 'document.querySelector(".drawer .fld.tem-erro")', 'Erro de edicao ausente');
} });
t('D2', 'estorno-validacao', { rota: 'lancamentos', ref: 'estorno', async preparar(c) {
  await estorno(c); await c.tocar('.drawer [data-ok]');
  await conferir(c, 'document.querySelector(".drawer .fld.tem-erro")', 'Motivo obrigatorio nao sinalizado');
} });
t('D2', 'estorno-preenchido', { rota: 'lancamentos', ref: 'estorno', async preparar(c) {
  await estorno(c); await c.digitar('.drawer [name="motivo"]', 'Pagamento em duplicidade, identificado na conferência fictícia C5.');
} });
// Estados de leitura: objetos visuais derivados de uma linha ficticia, sem estornar no banco.
for (const estado of ['detalhe', 'estornado', 'movimento-estorno']) {
  t('D2', estado, { rota: 'lancamentos', async preparar(c) {
    await buscar(c, 'Compra avulsa 2');
    await c.avaliar(`(async () => {
      const id = document.querySelector('tr.rw').dataset.id;
      const l = { ...(await CC.api('/lancamentos/' + id)).data };
      if ('${estado}' === 'detalhe') return CC.d.verLancamento(l);
      if ('${estado}' === 'estornado') l.estornado = true;
      else { l.estorno_de = l.id; l.motivo_estorno = 'Conferência visual C5'; }
      return CC.d.lanc.leitura(l);
    })()`);
    await c.painel();
    assert.equal(await c.avaliar('document.querySelectorAll(".drawer [data-salvar]").length'), 0);
  } });
}
t('D1', 'rapido-final', { rota: 'inicio', ref: 'rapido', async preparar(c) {
  await c.tocar('[data-rapido]'); await c.painel(); await fim(c);
} });

// Sucesso visual do POST: nao persiste lancamento, nao prova o contrato financeiro.
t('D2', 'registrado-simulado', { rota: 'lancamentos', ref: 'ok', async preparar(c) {
  await novo(c);
  await c.digitar('.drawer [name="descricao"]', 'Material de acabamento · conferência C5');
  await c.digitar('.drawer [name="valor"]', '2480,00');
  await c.digitar('.drawer [name="category_id"]', String(c.s.cats.Material));
  await c.avaliar(`(() => {
    const api = CC.api;
    CC.api = (rota, op = {}) => rota === '/lancamentos' && op.method === 'POST'
      ? Promise.resolve({ data: { id: 'c5-visual' } }) : api(rota, op);
  })()`);
  await c.tocar('.drawer [data-salvar]');
  await conferir(c, 'document.querySelector("#drw-tit")?.textContent === "Lançamento registrado"', 'Confirmacao ausente');
} });

for (const tela of catalogo) {
  const preparar = tela.preparar;
  tela.preparar = async c => {
    // Cada captura comeca sem filtros herdados, inclusive ao repetir um estado isolado.
    await c.avaliar("localStorage.removeItem('cc_d_filtros_lanc'); localStorage.removeItem('cc_first_use_dismissed');");
    await c.recarregar();
    await conferir(c, tela.grupo === 'D1' ? 'document.querySelector(".inicio .kpi")' : 'document.querySelector(".lancamentos .tbl")', 'Tela nao carregou');
    if (preparar) await preparar(c);
    const falhas = await c.avaliar(`(() => {
      const falhas = [];
      for (const raiz of document.querySelectorAll('#conteudo, .drawer .dcorpo')) {
        if (raiz.scrollWidth > raiz.clientWidth + 2) falhas.push('horizontal: ' + raiz.className);
        for (const e of raiz.querySelectorAll('*')) {
          if (!e.getClientRects().length || e.closest('[hidden]')) continue;
          const cs = getComputedStyle(e);
          if (!['SELECT','TEXTAREA','INPUT'].includes(e.tagName)) {
            if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2) falhas.push('rolagem interna: ' + e.className);
            if (/(hidden|clip|auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2) falhas.push('corte horizontal: ' + e.className);
          }
        }
      }
      const rod = document.querySelector('.drawer .drod')?.getBoundingClientRect();
      if (rod && (rod.bottom > innerHeight + 1 || rod.right > innerWidth + 1)) falhas.push('rodape fora da janela');
      return falhas;
    })()`);
    assert.deepEqual(falhas, [], 'Corte ou rolagem aninhada');
  };
}

const args = process.argv.slice(2);
assert.ok(!args.includes('--validacao'), 'C5 nao sobrescreve evidencias do C1');
if (!args.includes('--porta')) process.argv.push('--porta', '3221');
assert.equal(process.argv[process.argv.indexOf('--porta') + 1], '3221', 'Use app 3221, Chrome 3222, Referencia 3223, extras 3224-3225');
if (!args.includes('--tamanhos')) process.argv.push('--tamanhos', '1280x720,1280x800,1440x900');
if (!args.includes('--saida')) process.argv.push('--saida', path.join(pasta, 'depois'));
const saida = path.resolve(process.argv[process.argv.indexOf('--saida') + 1]);
assert.ok(saida.startsWith(pasta + path.sep), 'Saida deve ficar dentro de validacao/C5');
(async () => {
  if (!args.includes('--listar')) {
    const chrome = await cdp.abrirChrome({ porta: 3222 }); await chrome.encerrar();
  }
  require('./conferir');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
