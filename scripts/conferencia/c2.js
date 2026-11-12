// C2: conferência visual e fluxos com dados fictícios. Reutiliza o kit C1 e seu banco temporário.
// node scripts/conferencia/c2.js --saida docs/suite-desktop/validacao/C2/depois
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { catalogo } = require('./telas');

const ALVOS = ['fechamento', 'fechar-com-pendencias', 'mes-fechado', 'reabrir-com-motivo', 'historico', 'historico-fechamentos', 'historico-detalhe'];
const posSomente = process.argv.indexOf('--somente');
const escolhidos = posSomente >= 0 ? process.argv.splice(posSomente, 2)[1].split(',') : ALVOS;
for (const id of escolhidos) assert.ok(ALVOS.includes(id), `Tela fora do C2: ${id}`);
const posSaida = process.argv.indexOf('--saida');
const saida = path.resolve(posSaida >= 0 ? process.argv[posSaida + 1] : 'docs/suite-desktop/validacao/C2/depois');
if (posSaida < 0) process.argv.push('--saida', saida);
fs.mkdirSync(saida, { recursive: true });
const verificacoes = [];
if (!process.argv.includes('--listar')) process.on('exit', () => fs.writeFileSync(path.join(saida, 'verificacoes.json'), JSON.stringify(verificacoes, null, 2)));

async function layout(c) {
  const r = await c.avaliar(`(() => {
    const tabelas = [...document.querySelectorAll('.fech-tabela, .historico .tabela')];
    const lista = document.querySelector('.fech-checklist');
    const itens = [...document.querySelectorAll('.fech-checklist .ck-item')];
    const ano = document.querySelector('[data-ano]');
    let anoLegivel = true;
    if (ano) {
      const css = getComputedStyle(ano), ctx = document.createElement('canvas').getContext('2d');
      ctx.font = css.font;
      anoLegivel = ctx.measureText(ano.selectedOptions[0].text).width <= ano.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    }
    const painel = document.querySelector('.drawer .dcorpo');
    return {
      anoLegivel,
      checklistVertical: !lista || (getComputedStyle(lista).display === 'block' && itens.every((e, i) => !i || e.getBoundingClientRect().top >= itens[i-1].getBoundingClientRect().bottom - 1)),
      checklistDentro: itens.every(e => e.getBoundingClientRect().right <= innerWidth),
      tabelasSemRolagemHorizontal: tabelas.every(e => e.scrollWidth <= e.clientWidth + 1),
      painelSemCorteHorizontal: !painel || painel.scrollWidth <= painel.clientWidth + 1
    };
  })()`);
  for (const [nome, ok] of Object.entries(r)) assert.equal(ok, true, `${nome} em ${c.tam} ${c.tema}`);
  return r;
}

async function fluxoFechamento(c) {
  const ano = Number(c.s.mes.slice(0, 4)), mes = Number(c.s.mes.slice(5));
  await c.tocar('.cab [data-fechar]');
  await c.dialogo();
  await c.tocar('.dialogo-camada [data-r="1"]');
  assert.ok(await c.esperar("!document.querySelector('.dialogo-camada') && document.querySelector('.selo-fechado')", 12000), 'mês fechado pela tela');
  await c.aba.print(path.join(saida, 'fluxo-mes-fechado.jpg'));
  const resumo = await c.api(`/fechamento-mensal/resumo?ano=${ano}`);
  assert.equal(resumo.meses[mes - 1].fechado, true);
  assert.ok(resumo.meses[mes - 1].pendencias.length, 'pendências ficam registradas');
  await c.tocar(`[data-reabrir="${mes}"]`);
  await c.dialogo();
  await c.tocar('.dialogo-camada [data-r="1"]');
  assert.ok(await c.esperar("document.querySelector('.dialogo-camada .erro').textContent.includes('10')"), 'motivo vazio recusado');
  await c.aba.print(path.join(saida, 'fluxo-motivo-invalido.jpg'));
  const motivo = 'Conferência C2: documento recebido após o fechamento.';
  await c.digitar('.dialogo-camada [name="motivo"]', motivo);
  await c.tocar('.dialogo-camada [data-r="1"]');
  assert.ok(await c.esperar("!document.querySelector('.dialogo-camada') && document.querySelector('.cab [data-fechar]')", 12000));
  assert.equal((await c.api(`/fechamento-mensal/resumo?ano=${ano}`)).meses[mes - 1].fechado, false);
  const auditoria = (await c.api('/historico?tipo=fechamento&pagina=1&limite=50')).itens;
  assert.ok(auditoria.some(i => i.acao === 'reaberto' && i.data.motivo === motivo), 'motivo fica no Histórico');
  return { fechouComPendencias: true, recusouMotivoVazio: true, reabriuComMotivoAuditado: true };
}

async function fluxoHistorico(c) {
  await c.digitar('[data-sel="periodo"]', 'custom');
  await c.dormir(700);
  await c.digitar('[data-data="de"]', `${c.s.mes}-01`);
  await c.digitar('[data-data="ate"]', c.s.hoje);
  await c.dormir(900);
  await layout(c);
  await c.aba.print(path.join(saida, `historico-datas-${c.tema}.jpg`));
  const csv = await c.avaliar(`(async () => {
    const r = await fetch('/api/historico/exportar.csv?de=${c.s.mes}-01&ate=${c.s.hoje}', { headers: { Authorization: 'Bearer ' + CC.session.token() } });
    return { status: r.status, tipo: r.headers.get('content-type'), temRegistros: (await r.text()).split('\\n').length > 2 };
  })()`);
  assert.equal(csv.status, 200);
  assert.match(csv.tipo, /text\/csv/);
  assert.equal(csv.temRegistros, true);
  await c.digitar('[data-sel="periodo"]', '');
  await c.dormir(700);
  await c.digitar('[data-busca]', 'Texto inexistente C2');
  await c.dormir(1100);
  assert.ok(await c.esperar("document.querySelector('#conteudo').innerText.includes('Nenhum registro')"));
  await c.aba.print(path.join(saida, `historico-vazio-${c.tema}.jpg`));
  await c.digitar('[data-busca]', '');
  await c.dormir(1100);
  return { datasSemCorte: true, csvComRegistros: true, estadoVazio: true };
}

for (const tela of catalogo.filter(t => t.grupo === 'D7' && ALVOS.includes(t.id))) {
  const preparar = tela.preparar;
  tela.preparar = async c => {
    const registro = { tela: tela.id, tamanho: c.tam, tema: c.tema };
    verificacoes.push(registro);
    try {
      if (preparar) await preparar(c);
      registro.layout = await layout(c);
      if (tela.id === 'fechamento' && c.tam === '1280x720' && c.tema === 'claro') registro.fluxo = await fluxoFechamento(c);
      if (tela.id === 'historico' && c.tam === '1280x720') registro.fluxo = await fluxoHistorico(c);
      if (tela.id === 'historico-detalhe') {
        await c.avaliar(`CC.d.hist.abrirDetalhe({ usuario: 'Marina Costa', created_at: new Date().toISOString(), acao: 'atualizado', tipo: 'lancamento', resumo: 'Materiais da obra de exemplo', antes: { description: 'Cimento', amount: 100 }, data: { description: 'Cimento CP-II', amount: 150 }, origem: 'computador' })`);
        await c.painel();
        await layout(c);
        await c.aba.print(path.join(saida, `historico-antes-depois-${c.tam}-${c.tema}.jpg`));
        await c.tecla('Escape');
        await preparar(c);
      }
      registro.ok = true;
    } catch (error) { registro.ok = false; registro.erro = error.message; throw error; }
  };
}
// Escopo qualificado evita capturar o estado homônimo "mes-fechado" de Lançamentos (D2).
process.argv.splice(2, 0, ...escolhidos.map(id => `D7/${id}`));
if (!process.argv.includes('--tamanhos')) process.argv.push('--tamanhos', '1280x720,1280x800,1440x900');
if (!process.argv.includes('--porta')) process.argv.push('--porta', '3141');
require('./conferir');
