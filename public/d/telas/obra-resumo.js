// Aba Resumo e aba Caixa da obra (mesmas do celular: public/m/screen-obra.js).
// Resumo: resultado ate agora e o que resolver. Caixa: contas em aberto, da mais proxima a mais distante.
(function (CC) {
  const D = CC.d;
  const { esc } = CC;
  const O = D.obras = D.obras || {};
  const U = D.ui;
  O.abas = O.abas || {};

  const linha = (rotulo, valor, cls) => `<span><span>${esc(rotulo)}</span><b${cls ? ` class="${cls}"` : ''}>${esc(valor)}</b></span>`;

  O.abas.resumo = (corpo, obra, vivo, dados) => {
    const lista = (dados && dados.lancamentos) || [];
    const orcamento = Number(obra.orcamento) || 0;
    const gasto = Number(obra.total_comprometido) || 0;
    const contrato = Number(obra.valor_contrato) || 0;
    const p = orcamento > 0 ? Math.round((gasto / orcamento) * 100) : null;
    const vencidos = lista.filter((t) => t.situacao === 'vencido');
    const aPagar = lista.filter((t) => t.status_financeiro === 'pendente' && t.tipo === 'despesa' && t.situacao !== 'vencido');
    const soma = (itens) => itens.reduce((s, t) => s + Number(t.valor), 0);
    const pend = [];
    if (vencidos.length) pend.push(['warning-circle', D.plural(vencidos.length, 'conta vencida', 'contas vencidas'), CC.money(soma(vencidos)), 'err']);
    if (p !== null && p > 100) pend.push(['trend-up', 'Custo acima do orçado', `${p}% do orçado`, 'warn']);
    if (aPagar.length) pend.push(['calendar-blank', D.plural(aPagar.length, 'conta a pagar', 'contas a pagar'), CC.money(soma(aPagar)), '']);
    const resultado = Number(obra.total_receitas) - Number(obra.total_despesas);
    corpo.innerHTML = `<div class="grade-obra"><div class="principal">
      <section class="card bloco"><span class="lbl">Resultado até agora</span>
        <b class="resumo-valor ${resultado < 0 ? 'err' : ''}">${esc(CC.signed(resultado))}</b>
        <div class="linhas-dl">${contrato ? linha('Contrato (receita)', CC.money(contrato)) : ''}${linha('Orçamento da obra', orcamento > 0 ? CC.money(orcamento) : 'Sem orçamento')}
          ${linha('Gasto (comprometido)', CC.money(gasto), p !== null && p > 100 ? 'err' : '')}${linha('Pago', CC.money(obra.total_despesas))}${linha('Recebido', CC.money(obra.total_receitas))}</div>
        ${p === null ? '' : `<span class="bar"><span class="${O.faixaUso ? O.faixaUso(p / 100) : ''}" style="width:${Math.min(100, p)}%"></span></span>
        <span class="muted">Gasto em relação ao orçamento da obra · ${p}%</span>`}</section></div>
      <aside class="lado-obra"><section class="card bloco"><b class="bt">Resolver nesta obra</b>
        ${pend.length ? `<div class="pendencias">${pend.map(([ic, t, v, tom]) => `<a class="pend ${tom}" href="#/obras/${esc(obra.id)}/caixa">${D.ic(ic)}<span class="tx"><b>${esc(t)}</b><span>${esc(v)}</span></span></a>`).join('')}</div>`
          : `<div class="pend-vazio">${D.ic('check-circle')}Nada pendente nesta obra.</div>`}</section></aside></div>`;
  };

  // Caixa: as contas em aberto da obra, pelo vencimento. Sem filtros: quem quer filtrar usa a aba Lançamentos.
  O.abas.caixa = (corpo, obra, vivo) => {
    const f = { ...D.lanc.padrao(), mes: '', sit: 'pendentes', ordenar: 'vencimento', ordem: 'asc' };
    return D.lanc.montarLista(corpo, { f, vivo, obraFixa: obra.id, semFiltros: true, vazio: 'Nenhuma conta em aberto.' });
  };
})(window.CC);
