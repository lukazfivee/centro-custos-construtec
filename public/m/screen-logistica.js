// Menu › Logistica (escritorio): casca com as cinco abas e a aba Resumo. Cada aba registra-se em CC.logi.modulos.
// Acesso igual ao desktop (public/d/d-core.js: logistica exige p5); o servidor confere de novo em cada rota.
(function (CC) {
  const { esc, icon } = CC;
  const F = CC.fin, A = CC.adm, L = CC.logi;
  const ABAS = [['resumo', 'Resumo'], ['ferramental', 'Ferramental'], ['materiais', 'Materiais'], ['pendencias', 'Pendências'], ['historico', 'Histórico']];
  const LIMITE = 8;

  CC.screens.logistica = async function (params) {
    if (!(await A.guard(params, 'p5', 'Logística'))) return undefined;
    const estado = L.estado;
    if (params && ABAS.some(([chave]) => chave === params.aba)) { estado.aba = params.aba; if (params.sub) estado.sub[params.aba] = params.sub; }
    const page = CC.render(`${F.top('Logística', 'Ferramentas, materiais e fichas dos técnicos')}
      <div class="chips" role="group" aria-label="Seções da logística">${ABAS.map(([chave, rotulo]) => `<button type="button" class="chip-act" data-aba="${chave}">${rotulo}</button>`).join('')}</div>
      <div id="lg-nota"></div><div class="lgo-acoes" id="lg-acoes"></div><div class="lgo-corpo" id="lg-corpo"></div>`, true, params);
    F.voltar(page, () => CC.go('menu'));
    const corpo = CC.$('#lg-corpo', page), barra = CC.$('#lg-acoes', page), nota = CC.$('#lg-nota', page), abas = CC.$$('[data-aba]', page);
    let cache = {}, salvos = {}, sequencia = 0;
    const vivo = () => page.isConnected && (!params || !params.__nav || params.__nav === CC.nav);

    const ctx = {
      page, corpo, estado,
      get dados() { return cache; },
      // Le so o que falta; sem internet usa a ultima resposta guardada no celular (CC.cached).
      carregar: async (chaves) => {
        await Promise.all(chaves.filter((chave) => !(chave in cache)).map(async (chave) => {
          const r = await CC.cached(`logi-${chave}`, L.API[chave]);
          cache[chave] = r.data;
          if (r.stale) salvos[chave] = r.at;
        }));
        return cache;
      },
      // Troca de aba ou de visao; filtro opcional { status, busca, fichas, estoque } abre a lista ja filtrada.
      ir: (aba, sub, filtro) => {
        estado.aba = aba;
        if (sub) estado.sub[aba] = sub;
        for (const chave of ['status', 'busca', 'fichas', 'estoque']) if (filtro && chave in filtro) estado[chave] = filtro[chave];
        return mostrar();
      },
      // Depois de salvar: descarta o que estava guardado e refaz a aba que esta aberta.
      atualizar: () => { cache = {}; salvos = {}; return mostrar(); },
    };

    async function mostrar() {
      const modulo = L.modulos[estado.aba], id = ++sequencia;
      abas.forEach((b) => {
        const ativa = b.dataset.aba === estado.aba;
        b.setAttribute('aria-pressed', ativa ? 'true' : 'false');
        if (ativa) b.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
      barra.innerHTML = modulo.acoes.map(([ic, rotulo], i) => `<button type="button" class="${i ? 'btn2' : 'btn'}" data-acao="${i}">${icon(ic, 18)}${esc(rotulo)}</button>`).join('');
      barra.hidden = !modulo.acoes.length;
      CC.$$('[data-acao]', barra).forEach((b) => b.addEventListener('click', () => modulo.acoes[Number(b.dataset.acao)][2](ctx)));
      const chaves = modulo.dados(estado);
      if (chaves.some((chave) => !(chave in cache))) corpo.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
      try { await ctx.carregar(chaves); } catch (error) {
        if (!vivo() || id !== sequencia) return;
        const offline = error && error.status === 0;
        nota.innerHTML = '';
        corpo.innerHTML = `<div class="empty">${icon(offline ? 'wifi-slash' : 'warning-circle', 28)}${esc(offline ? 'Sem internet e sem dados salvos para esta aba ainda.' : (error && error.message) || 'Não foi possível carregar a logística.')}
          <button class="btn2 lgo-denovo" type="button" id="lg-denovo">Tentar de novo</button></div>`;
        CC.$('#lg-denovo', corpo).addEventListener('click', mostrar);
        return;
      }
      if (!vivo() || id !== sequencia) return;
      const antigos = chaves.map((chave) => salvos[chave]).filter(Boolean);
      nota.innerHTML = antigos.length ? CC.staleNote({ stale: true, at: Math.min(...antigos) }) : '';
      modulo.desenhar(ctx);
    }

    abas.forEach((b) => b.addEventListener('click', () => { if (b.dataset.aba !== estado.aba) ctx.ir(b.dataset.aba); }));
    await mostrar();
    return undefined;
  };

  // ---- Aba Resumo: indicadores que levam a lista filtrada e as pendencias, da mais urgente para a menos.
  // destino: [aba, visao, filtro que a lista de destino ja abre aplicado].
  function indicadores(r, abaixo) {
    const alerta = (n, tom) => (Number(n) ? tom : '');
    return [
      ['Aguardando assinatura', r.aguardando_assinatura, 'fichas com o técnico', alerta(r.aguardando_assinatura, 'warn'), ['pendencias', undefined, { fichas: 'aguardando_assinatura' }]],
      ['Divergências', r.divergencias, 'fichas contestadas', alerta(r.divergencias, 'err'), ['pendencias', undefined, { fichas: 'divergencia' }]],
      ['Abaixo do mínimo', abaixo, 'materiais para repor', alerta(abaixo, 'warn'), ['materiais', 'estoque', { estoque: 'baixo' }]],
      ['Em avaliação', r.em_avaliacao, 'ferramentas com avaria', alerta(r.em_avaliacao, 'warn'), ['ferramental', 'inventario', { status: 'em_avaliacao', busca: '' }]],
      ['Com técnicos', r.com_tecnicos, 'ferramentas em campo', '', ['ferramental', 'inventario', { status: 'com_tecnico', busca: '' }]],
      ['Disponíveis', r.disponiveis, 'prontas para entrega', '', ['ferramental', 'inventario', { status: 'disponivel', busca: '' }]],
    ];
  }

  // Cada pendencia: [tom da etiqueta, etiqueta, texto, botao, destino ou acao].
  function pendencias(d) {
    const r = d.resumo, linhas = [], s = (n) => (n > 1 ? 's' : '');
    if (r.divergencias) linhas.push(['fin-err', 'Divergência', `${r.divergencias} ficha${s(r.divergencias)} contestada${s(r.divergencias)} pelo técnico, aguardando revisão`, 'Revisar', 'ir:pendencias::divergencia']);
    if (r.aguardando_assinatura) linhas.push(['warn', 'Assinatura', `${r.aguardando_assinatura} ficha${s(r.aguardando_assinatura)} aguardando assinatura do técnico`, 'Ver', 'ir:pendencias::aguardando_assinatura']);
    d.faltas.forEach((f) => linhas.push(['fin-err', 'Falta', `${f.ferramenta} (${f.codigo}) relatada por ${f.tecnico}${f.apuracao ? '' : ', sem apuração'}`, 'Apurar', 'ir:pendencias']));
    L.pedidosAbertos(d.pedidos).forEach((p) => linhas.push(['', 'Pedido', `${L.qtd(L.restante(p))} ${p.unidade} de ${p.material} para ${p.centro}, pedido por ${p.tecnico}`, 'Entregar', 'ir:materiais:pedidos']));
    d.devolucoes.forEach((v) => linhas.push(['', 'Devolução', `${L.qtd(v.pendente)} ${v.unidade} de ${v.material} com ${v.tecnico}`, 'Ver', 'ir:pendencias']));
    d.materiais.filter((m) => m.estoque_baixo).forEach((m) => linhas.push(['warn', 'Estoque', `${m.nome}: saldo ${L.qtd(m.saldo)} ${m.unidade}, mínimo ${L.qtd(m.estoque_minimo)}`, 'Dar entrada', `entrada:${m.id}`]));
    return linhas;
  }

  L.modulos.resumo = {
    dados: () => ['resumo', 'materiais', 'pedidos', 'faltas', 'devolucoes'],
    acoes: [
      ['wrench', 'Entregar ferramentas', (ctx) => L.checklist(ctx, 'entrega')],
      ['archive', 'Entregar material', (ctx) => L.entregarMaterial(ctx)],
    ],
    desenhar(ctx) {
      const abaixo = ctx.dados.materiais.filter((m) => m.estoque_baixo).length;
      const itens = indicadores(ctx.dados.resumo, abaixo), linhas = pendencias(ctx.dados), resto = linhas.length - LIMITE;
      ctx.corpo.innerHTML = `<div class="lgo-kpis">${itens.map(([rotulo, valor, det, tom], n) => `<button type="button" class="card lgo-kpi ${tom}" data-kpi="${n}" aria-label="${esc(`${rotulo}: ${Number(valor) || 0}. Abrir a lista`)}">
          <small>${esc(rotulo)}</small><b>${esc(Number(valor) || 0)}</b><span>${esc(det)}</span></button>`).join('')}</div>
        ${L.secao('Pede atenção agora', linhas.length ? String(linhas.length) : '')}
        ${linhas.length ? `<div class="lgo-lista">${linhas.slice(0, LIMITE).map(([tom, etiqueta, texto, botao, alvo]) => `<article class="card lgo-item"><span class="lgo-tags">${L.tag(etiqueta, tom)}</span><small class="lgo-forte">${esc(texto)}</small>
          <div class="lgo-bts"><button type="button" class="btn2" data-alvo="${esc(alvo)}" aria-label="${esc(`${botao}: ${texto}`)}">${esc(botao)}</button></div></article>`).join('')}</div>
          ${resto > 0 ? `<p class="sub lgo-nota">E mais ${resto} pendência${resto > 1 ? 's' : ''}. Veja as abas Pendências e Materiais.</p>` : ''}`
          : L.vazio('check-circle', 'Tudo em dia. Nenhuma falta, devolução, pedido ou estoque baixo no momento.')}`;
      CC.$$('[data-kpi]', ctx.corpo).forEach((b) => b.addEventListener('click', () => { const [aba, sub, filtro] = itens[Number(b.dataset.kpi)][4]; ctx.ir(aba, sub, filtro); }));
      CC.$$('[data-alvo]', ctx.corpo).forEach((b) => b.addEventListener('click', () => {
        const [tipo, aba, sub, fichas] = b.dataset.alvo.split(':');
        if (tipo === 'entrada') L.entradaMaterial(ctx, aba); else ctx.ir(aba, sub || undefined, { fichas: fichas || '' });
      }));
    },
  };
})(window.CC = window.CC || {});
