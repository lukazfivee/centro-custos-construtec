// Entrada do técnico: programação por data, sem usar a data inicial do serviço como agenda.
(function (CC) {
  const { esc, icon } = CC, F = CC.programacaoFila;
  CC.screens['meus-trabalhos'] = CC.homeTecnico;
  F.equipe = (a) => {
    const active = (a.participantes || []).filter((p) => p.ativo !== false);
    return `<p class="pg-count">${active.filter((p) => p.estado === 'concluido').length} de ${active.length} concluídos</p>
      <ul class="pg-equipe">${active.map((p) => `<li><span>${esc(p.nome)}${String(p.id) === String((CC.session.user() || {}).id) ? ' (você)' : ''}</span><b>${esc(F.estados[p.estado] || p.estado)}${p.pendente ? ' · no celular' : ''}</b></li>`).join('')}</ul>`;
  };
  F.destino = (a) => `<small class="pg-tipo">${icon(a.centro.tipo === 'servico' ? 'wrench' : 'buildings', 16)}${a.centro.tipo === 'servico' ? 'Serviço' : 'Obra'} · ${esc(a.centro.codigo)}</small><h2>${esc(a.centro.nome)}</h2>${a.centro.cliente ? `<p class="sub">${esc(a.centro.cliente)}</p>` : ''}`;
  F.execucao = (a) => CC.go(a.centro.tipo === 'servico' ? 'servico' : 'obra', { id: Number(a.centro.id), ...(a.centro.tipo === 'servico' ? { tab: 'exec' } : {}) });
  F.aviso = (a) => {
    const ops = a.filaOps || [], errors = ops.filter((i) => i.estado === 'erro');
    return ops.length ? `<p class="pg-pendente" role="status">${icon(errors.length ? 'warning-circle' : 'cloud-arrow-up', 16)}${errors.length ? `${errors.length} envio(s) precisam de revisão` : `${ops.length} atualização(ões) no celular · aguardando envio`}</p>` : '';
  };
  function mudarDia(dia, n) {
    const date = new Date(`${dia}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10);
  }
  CC.homeTecnico = CC.screens['meu-dia'] = async function (params = {}) {
    const valid = F.sessao(), current = () => valid() && (!params.__nav || params.__nav === CC.nav);
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.dia || '') ? params.dia : F.hoje();
    const top = `${CC.header('')}<h1 class="title">Meu dia</h1><p class="sub">Sua programação e o andamento de cada pessoa.</p>`;
    const el = CC.render(`${top}<div class="skeleton"></div>`, false, params);
    try {
      if (CC.programacaoNuvem && await CC.programacaoNuvem(current, el)) return;
      const result = await F.cached(`dia-${dia}`, `/programacao?dia=${dia}`);
      if (!current()) return;
      const atividades = await Promise.all((result.data.atividades || []).map(F.overlay));
      if (!current()) return;
      const view = CC.render(`${top}<div class="pg-data"><button type="button" class="btn2" id="pg-anterior" aria-label="Dia anterior">${icon('caret-left', 20)}</button>
        <label class="field"><span>Data da programação</span><input id="pg-dia" type="date" value="${esc(dia)}"></label>
        <button type="button" class="btn2" id="pg-proximo" aria-label="Próximo dia">${icon('caret-right', 20)}</button></div>
        <button type="button" class="chip-act" id="pg-hoje">Hoje</button>${CC.staleNote(result)}
        ${dia > F.hoje() ? '<p class="sub">Programação futura · disponível para consulta.</p>' : ''}
        <div class="pg-lista">${atividades.sort((a, b) => a.ordem - b.ordem || a.id - b.id).map((a) => `<article class="card pg-card">${F.destino(a)}
          ${a.cancelada ? '<p class="pg-pendente">Atividade cancelada</p>' : ''}<p class="pg-orientacao">${esc(a.orientacao || 'Sem orientação adicional.')}</p>
          ${F.equipe(a)}${F.aviso(a)}<button class="btn" type="button" data-pg-atividade="${a.id}">${icon('list-checks', 18)}Ver atividade e atualizar</button></article>`).join('') || `<div class="empty">${icon('calendar-blank', 28)}Nenhuma atividade programada para esta data.</div>`}</div>
        <button class="btn2 pg-trabalhos" type="button" id="pg-trabalhos">${icon('buildings', 18)}Minhas obras e serviços</button>`, false, params);
      const go = (value) => { if (value) CC.go('meu-dia', { dia: value }); };
      CC.$('#pg-dia', view).addEventListener('change', (event) => go(event.target.value));
      CC.$('#pg-anterior', view).addEventListener('click', () => go(mudarDia(dia, -1)));
      CC.$('#pg-proximo', view).addEventListener('click', () => go(mudarDia(dia, 1)));
      CC.$('#pg-hoje', view).addEventListener('click', () => go(F.hoje()));
      CC.$('#pg-trabalhos', view).addEventListener('click', () => CC.go('meus-trabalhos'));
      CC.$$('[data-pg-atividade]', view).forEach((b) => b.addEventListener('click', () => CC.go('atividade-dia', { id: Number(b.dataset.pgAtividade), dia })));
    } catch (error) { if (current() && !(error instanceof CC.Stale)) CC.errorScreen(el, error, () => CC.go('meu-dia', { dia })); }
  };
})(window.CC = window.CC || {});
