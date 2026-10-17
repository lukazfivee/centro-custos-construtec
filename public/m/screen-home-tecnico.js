// Inicio operacional do tecnico. As APIs aplicam o vinculo por obra/servico no servidor.
(function (CC) {
  const { esc, icon } = CC;
  const FILTROS = [['ativos', 'A fazer'], ['hoje', 'Hoje'], ['atrasados', 'Atrasados'], ['em_andamento', 'Em andamento'], ['concluido', 'Concluídos']];
  const aberto = (s) => ['agendado', 'em_andamento'].includes(s.situacao);
  const atrasado = (s, hoje) => aberto(s) && !!s.data && s.data < hoje;
  const normal = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Funcao pura compartilhada com os testes de agenda (datas ISO locais, sem conversao UTC).
  CC.tecnicoAgenda = function (lista, filtro, busca, hoje) {
    const termo = normal(busca);
    return lista.filter((s) => s.ativo !== false && (filtro === 'concluido' ? s.situacao === 'concluido' : aberto(s)))
      .filter((s) => filtro === 'hoje' ? s.data === hoje : filtro === 'atrasados' ? atrasado(s, hoje) : filtro === 'em_andamento' ? s.situacao === filtro : true)
      .filter((s) => normal([s.codigo, s.nome, s.cliente, s.local].join(' ')).includes(termo))
      .sort((a, b) => Number(b.situacao === 'em_andamento') - Number(a.situacao === 'em_andamento')
        || String(a.data || '9999').localeCompare(String(b.data || '9999')) || Number(a.id) - Number(b.id));
  };

  function cartao(s, hoje, fila) {
    const e = s.execucao, pend = fila.filter((i) => Number(i.servicoId) === Number(s.id));
    const erros = pend.filter((i) => i.estado === 'erro').length;
    const faltam = e ? [e.itens > e.feitos ? `${e.itens - e.feitos} ${(e.itens - e.feitos) === 1 ? 'item' : 'itens'} do checklist` : '',
      !e.fotosAntes ? 'foto antes' : '', !e.fotosDepois ? 'foto depois' : '', !e.aceite ? 'aceite' : ''].filter(Boolean) : [];
    const resumo = pend.length ? `${pend.length} ${pend.length === 1 ? 'registro no celular' : 'registros no celular'}${erros ? ` · ${erros} com erro` : ' · aguardando envio'}`
      : faltam.length ? `Falta: ${faltam.join(' · ')}` : e ? 'Checklist, fotos e aceite em dia' : 'Abra para conferir a execução';
    return `<article class="card tc-servico"><div class="line"><small class="sv-cod">${esc(s.codigo)}</small>${CC.sv.badge(s.situacao)}</div>
      <h2>${esc(s.nome)}</h2><p class="tc-meta">${esc([s.cliente, s.local].filter(Boolean).join(' · ') || 'Local não informado')}</p>
      <p class="tc-data${atrasado(s, hoje) ? ' wn' : ''}">${icon('calendar-blank', 16)}${s.data === hoje ? 'Hoje' : s.data ? esc(CC.dateFull(s.data)) : 'Sem data definida'}${atrasado(s, hoje) ? ' · data prevista passou' : ''}</p>
      <p class="tc-pend${erros ? ' wn' : ''}">${esc(resumo)}</p>
      <div class="tc-acoes"><button class="btn" type="button" data-exec="${s.id}">${icon('list-checks', 18)}Abrir execução</button>
        ${CC.sv.can('p2') ? `<button class="btn2" type="button" data-despesa="${s.id}" aria-label="Lançar despesa em ${esc(s.nome)}">${icon('receipt', 18)}Despesa</button>` : ''}</div></article>`;
  }

  CC.homeTecnico = async function (params) {
    const user = CC.session.user() || {}, primeiro = String(user.nome || user.name || '').trim().split(/\s+/)[0];
    const saudacao = `<p class="hello">${esc(CC.greeting())}${primeiro ? `, ${esc(primeiro)}` : ''}</p>`;
    const el = CC.render(`${CC.header('')}${saudacao}<h1 class="title">Meu trabalho</h1><div class="skeleton"></div><div class="skeleton"></div>`, false, params);
    let servicos, obras, fila;
    try {
      [servicos, obras, fila] = await Promise.all([CC.cached('servicos', '/servicos?ativo=true'),
        CC.cached('obras', `/centros-custo?mes=${CC.month()}`).catch((error) => { if (error.status === 401) throw error; return { error }; }),
        CC.queue.ops().then((items) => items.filter((i) => i.op !== 'programacao'))]);
    } catch (error) { if (error.status === 401 || (params && params.__nav !== CC.nav)) return; return CC.errorScreen(el, error, () => CC.go('home')); }
    if (!CC.session.token() || (params && params.__nav !== CC.nav)) return;
    const hoje = CC.today(), lista = servicos.data || [], ativos = lista.filter((s) => s.ativo !== false && aberto(s));
    let filtro = 'ativos';
    const counts = [['Hoje', ativos.filter((s) => s.data === hoje).length], ['Em andamento', ativos.filter((s) => s.situacao === 'em_andamento').length], ['Atrasados', ativos.filter((s) => atrasado(s, hoje)).length]];
    const projetos = (obras.data || []).filter((o) => (o.tipo || 'obra') === 'obra' && o.ativo !== false && o.situacao !== 'concluido');
    const view = CC.render(`${CC.header('')}${saudacao}<h1 class="title">Meu trabalho</h1><p class="sub">Obras e serviços liberados para seu perfil.</p>
      ${CC.staleNote(servicos)}<div class="summary tc-totais">${counts.map(([l, n]) => `<span><small>${l}</small><b>${n}</b></span>`).join('')}</div>
      ${fila.length ? `<button class="btn2 tc-fila" type="button" id="tc-fila">${icon('cloud-arrow-up', 18)}${fila.length} registros no celular${fila.some((i) => i.estado === 'erro') ? ' · verificar erros' : ' · ver envios'}</button>` : ''}
      <label class="field"><span>Buscar serviço</span><input id="tc-busca" type="search" placeholder="Serviço, cliente ou local" autocomplete="off"></label>
      <div class="tc-filtros" role="group" aria-label="Filtrar serviços">${FILTROS.map(([k, l]) => `<button class="chip-act" type="button" data-tc-filtro="${k}" aria-pressed="${k === filtro}">${l}</button>`).join('')}</div>
      <p class="sub" id="tc-total" role="status" aria-live="polite"></p><div id="tc-lista" class="tc-lista"></div>
      <span class="label">Obras em acompanhamento</span>${obras.stale ? CC.staleNote(obras) : ''}
      ${obras.error ? '<p class="sub">Não foi possível carregar as obras. Abra a aba Obras para tentar novamente.</p>' : projetos.length ? `<div class="rows">${projetos.map((o) => `<button class="row" type="button" data-tc-obra="${o.id}"><span class="line"><span class="grow"><b>${esc(o.nome)}</b><br><small>${esc(o.cliente || o.codigo || '')}</small></span>${icon('caret-right', 18)}</span></button>`).join('')}</div>` : '<p class="sub">Nenhuma obra em acompanhamento.</p>'}`, false, params);
    const busca = CC.$('#tc-busca', view), destino = CC.$('#tc-lista', view);
    const pintar = () => {
      const visiveis = CC.tecnicoAgenda(lista, filtro, busca.value, hoje);
      CC.$('#tc-total', view).textContent = `${visiveis.length} ${visiveis.length === 1 ? 'serviço' : 'serviços'}`;
      destino.innerHTML = visiveis.map((s) => cartao(s, hoje, fila)).join('') || `<div class="empty">${icon('check-circle', 28)}${busca.value ? 'Nenhum serviço encontrado.' : filtro === 'ativos' ? 'Nenhum serviço a fazer. Novas atribuições aparecem aqui.' : 'Nenhum serviço neste filtro.'}</div>`;
      CC.$$('[data-exec]', destino).forEach((b) => b.addEventListener('click', () => CC.go('servico', { id: Number(b.dataset.exec), tab: 'exec' })));
      CC.$$('[data-despesa]', destino).forEach((b) => b.addEventListener('click', () => CC.sv.gasto(lista.find((s) => Number(s.id) === Number(b.dataset.despesa)))));
    };
    busca.addEventListener('input', pintar);
    CC.$$('[data-tc-filtro]', view).forEach((b) => b.addEventListener('click', () => {
      filtro = b.dataset.tcFiltro;
      CC.$$('[data-tc-filtro]', view).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pintar();
    }));
    CC.$$('[data-tc-obra]', view).forEach((b) => b.addEventListener('click', () => CC.go('obra', { id: Number(b.dataset.tcObra) })));
    const enviar = CC.$('#tc-fila', view);
    if (enviar) enviar.addEventListener('click', () => { const item = fila[0]; if (item) CC.go('servico', { id: Number(item.servicoId), tab: 'exec' }); });
    pintar();
  };
})(window.CC = window.CC || {});
