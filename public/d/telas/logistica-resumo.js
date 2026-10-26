// Aba Resumo: indicadores que levam a lista filtrada e as pendencias do dia, da mais urgente para a menos.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const L = D.logi;
  const { esc } = CC;
  const LIMITE = 8;

  // destino: [aba, visao, situacao da ferramenta].
  function indicadores(r, abaixo) {
    const alerta = (n, tom) => (n ? tom : 'info');
    return [
      { rotulo: 'Aguardando assinatura', valor: r.aguardando_assinatura, det: 'fichas com o técnico', icone: 'signature', tom: alerta(r.aguardando_assinatura, 'warn'), destino: ['pendencias'] },
      { rotulo: 'Divergências', valor: r.divergencias, det: 'fichas contestadas', icone: 'warning-circle', tom: alerta(r.divergencias, 'err'), tomValor: r.divergencias ? 'err' : '', destino: ['pendencias'] },
      { rotulo: 'Abaixo do mínimo', valor: abaixo, det: 'materiais para repor', icone: 'warning', tom: alerta(abaixo, 'warn'), destino: ['materiais', 'estoque'] },
      { rotulo: 'Em avaliação', valor: r.em_avaliacao, det: 'ferramentas com avaria', icone: 'wrench', tom: alerta(r.em_avaliacao, 'warn'), destino: ['ferramental', 'inventario', 'em_avaliacao'] },
      { rotulo: 'Com técnicos', valor: r.com_tecnicos, det: 'ferramentas em campo', icone: 'users', destino: ['ferramental', 'inventario', 'com_tecnico'] },
      { rotulo: 'Disponíveis', valor: r.disponiveis, det: 'prontas para entrega', icone: 'check-circle', tom: 'ok', destino: ['ferramental', 'inventario', 'disponivel'] },
    ];
  }

  // Cada pendencia: [tom do chip, rotulo do chip, texto, botao, destino ou acao].
  function pendencias(ctx) {
    const { resumo: r, materiais, pedidos, faltas, devolucoes } = ctx.dados;
    const linhas = [];
    if (r.divergencias) linhas.push(['err', 'Divergência', `${r.divergencias} ficha${r.divergencias > 1 ? 's' : ''} contestada${r.divergencias > 1 ? 's' : ''} pelo técnico, aguardando revisão`, 'Ver', 'ir:pendencias']);
    if (r.aguardando_assinatura) linhas.push(['warn', 'Assinatura', `${r.aguardando_assinatura} ficha${r.aguardando_assinatura > 1 ? 's' : ''} aguardando assinatura do técnico`, 'Ver', 'ir:pendencias']);
    faltas.forEach((f) => linhas.push(['err', 'Falta', `${f.ferramenta} (${f.codigo}) relatada por ${f.tecnico}${f.apuracao ? '' : ', sem apuração'}`, 'Apurar', 'ir:pendencias']));
    pedidos.filter((p) => ['solicitada', 'parcial'].includes(p.status)).forEach((p) => linhas.push(['info', 'Pedido', `${L.qtd(Number(p.solicitada) - Number(p.entregue))} ${p.unidade} de ${p.material} para ${p.centro}, pedido por ${p.tecnico}`, 'Entregar', 'ir:materiais:pedidos']));
    devolucoes.forEach((d) => linhas.push(['info', 'Devolução', `${L.qtd(d.pendente)} ${d.unidade} de ${d.material} com ${d.tecnico}`, 'Ver', 'ir:pendencias']));
    materiais.filter((m) => m.estoque_baixo).forEach((m) => linhas.push(['warn', 'Estoque', `${m.nome}: saldo ${L.qtd(m.saldo)} ${m.unidade}, mínimo ${L.qtd(m.estoque_minimo)}`, 'Dar entrada', `entrada:${m.id}`]));
    return linhas;
  }

  const linhaHtml = ([tom, chip, texto, botao, alvo]) => `<li class="logi-pend"><span class="chip ${tom}">${esc(chip)}</span><span class="logi-pend-txt">${esc(texto)}</span><button type="button" class="btn btn-s" data-alvo="${esc(alvo)}" aria-label="${esc(`${botao}: ${texto}`)}">${esc(botao)}</button></li>`;

  L.modulos.resumo = {
    dados: () => ['resumo', 'materiais', 'pedidos', 'faltas', 'devolucoes'],
    acoes: [
      ['entregar', 'p', 'package', 'Entregar ferramentas', (ctx) => L.checklist(ctx, 'entrega')],
      ['material', 's', 'package', 'Entregar material', (ctx) => L.entregarMaterial(ctx)],
    ],
    desenhar(ctx) {
      const abaixo = ctx.dados.materiais.filter((m) => m.estoque_baixo).length;
      const itens = indicadores(ctx.dados.resumo, abaixo);
      const linhas = pendencias(ctx);
      ctx.corpo.innerHTML = `<div class="logi-painel-int" data-resumo><div class="kpis">${itens.map((i, n) => `<button type="button" class="logi-atalho" data-kpi="${n}" aria-label="${esc(`${i.rotulo}: ${i.valor}. Abrir a lista`)}">${U.kpi({ rotulo: i.rotulo, valor: Number(i.valor) || 0, det: i.det, icone: i.icone, tom: i.tom, tomValor: i.tomValor })}</button>`).join('')}</div>
        <section class="card logi-atencao"><h2 class="logi-titulo">Pede atenção agora</h2>${linhas.length ? `<ul class="logi-pend-lista">${linhas.slice(0, LIMITE).map(linhaHtml).join('')}</ul>${linhas.length > LIMITE ? `<p class="muted logi-nota">E mais ${linhas.length - LIMITE} pendência${linhas.length - LIMITE > 1 ? 's' : ''}. Veja as abas Pendências e Materiais.</p>` : ''}` : U.vazio('check-circle', 'Tudo em dia.', 'Nenhuma falta, devolução, pedido ou estoque baixo no momento.')}</section></div>`;
      const raiz = CC.$('[data-resumo]', ctx.corpo);
      raiz.addEventListener('click', (ev) => {
        const kpi = ev.target.closest('[data-kpi]'), alvo = ev.target.closest('[data-alvo]');
        if (kpi) { const [aba, sub, status] = itens[Number(kpi.dataset.kpi)].destino; ctx.ir(aba, sub, status ? { status, busca: '' } : {}); }
        else if (alvo) {
          const [tipo, aba, sub] = alvo.dataset.alvo.split(':');
          if (tipo === 'entrada') L.entradaMaterial(ctx, aba); else ctx.ir(aba, sub);
        }
      });
    },
  };
})(window.CC);
