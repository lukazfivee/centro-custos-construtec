// Menu › Recorrentes: modelos que viram lancamentos todo mes, pausar e reativar, "Gerar lancamentos do mes"
// com previa e as proximas geracoes do mes seguinte. Mesmas rotas do desktop (public/d/telas/recorrentes.js,
// routes/recurring.js). A tela segue o desktop (p5); criar, editar, pausar e gerar exigem p5 no servidor.
(function (CC) {
  const { esc, icon, money } = CC;
  const F = CC.fin;
  F.FREQ = { mensal: 'Mensal', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
  const parcelas = (m) => {
    const feitas = Number(m.geradas) || 0;
    return m.total_parcelas ? `${feitas} de ${m.total_parcelas} geradas` : `Sem fim · ${feitas} geradas`;
  };
  // Corpo do PUT a partir da linha da lista, com as mudancas por cima.
  F.corpoRecorrente = (m, mudar) => ({ nome: m.nome, tipo: m.tipo, cost_center_id: m.cost_center_id, category_id: m.category_id, favorecido: m.favorecido || '',
    valor: Number(m.valor), dia_mes: m.dia_mes, frequencia: m.frequencia, total_parcelas: m.total_parcelas, forma_pagamento: m.forma_pagamento || '', ativo: m.ativo !== false, ...(mudar || {}) });

  function linha(m, pode) {
    return `<div class="row fin-row"><button type="button" class="fin-open" data-rec="${esc(m.id)}"${pode ? '' : ' disabled'}>
      <span class="line"><span class="grow name">${esc(m.nome)}</span><span class="tag${m.ativo ? ' fin-ok' : ''}">${m.ativo ? 'Ativo' : 'Pausado'}</span></span>
      <span class="cli">${esc([`${m.centro_codigo} · ${m.centro_nome}`, m.favorecido].filter(Boolean).join(' · '))}</span>
      <span class="line foot"><span class="grow">${esc(`${F.FREQ[m.frequencia] || m.frequencia} · dia ${m.dia_mes || 1} · ${parcelas(m)}`)}</span>
        <b class="fin-val">${esc(money(m.valor))}</b></span></button>
      ${pode ? `<button class="chip-act fin-pausar" type="button" data-pausar="${esc(m.id)}">${icon(m.ativo ? '' : 'play', 16)}${m.ativo ? 'Pausar' : 'Reativar'}</button>` : ''}</div>`;
  }

  function proximas(previa) {
    const nome = F.mesCurto(previa.mes);
    const itens = previa.itens.map((i) => `<div class="tx"><span class="fin-dia"><b>${esc(String(i.data).slice(8, 10))}</b><small>${esc(nome.slice(0, 3))}</small></span>
      <span class="grow"><b>${esc(i.nome)}</b><small>${esc([i.obra, i.favorecido].filter(Boolean).join(' · '))}</small></span><span class="amt">${esc(money(i.valor))}</span></div>`).join('');
    return `<div class="card"><div class="kv"><span class="label">Próximas gerações</span><b>${esc(CC.mesNome(previa.mes))}</b></div>
      ${itens || `<p class="sub fin-nota">Nenhum recorrente cai em ${esc(nome)}.</p>`}
      ${previa.itens.length ? `<div class="kv"><span>${esc(F.plural(previa.total_itens, 'lançamento previsto', 'lançamentos previstos'))}</span><b>${esc(money(previa.total_valor))}</b></div>` : ''}
      <p class="sub fin-nota">Os lançamentos entram como "A pagar" no dia de cada modelo. A geração é por mês e não duplica.</p></div>`;
  }

  function gerarCard(previa, pode) {
    const nome = F.mesCurto(previa.mes);
    if (previa.itens.length) {
      return `<div class="card fin-prox"><span class="label">Este mês</span><b>${esc(`${F.plural(previa.total_itens, 'lançamento', 'lançamentos')} para gerar em ${nome} · ${money(previa.total_valor)}`)}</b>
        ${pode ? `<button class="btn" type="button" id="rec-gerar">${icon('plus-circle', 18)}Gerar lançamentos de ${esc(nome)}</button>` : ''}</div>`;
    }
    const feitos = previa.gerados.length;
    return `<div class="note ok">${icon(feitos ? 'check-circle' : 'calendar-blank', 18)}<span>${esc(feitos ? `${CC.mesNome(previa.mes)} já gerado · ${F.plural(feitos, 'lançamento', 'lançamentos')}` : `Sem lançamentos para gerar em ${nome}`)}</span></div>`;
  }

  CC.screens.recorrentes = async function (params) {
    const voltar = () => CC.go('menu');
    const el = F.carregando('Recorrentes', '', voltar);
    const mes = CC.month();
    let lista, atual, prox;
    try {
      [{ data: lista }, { data: atual }, { data: prox }] = await Promise.all([CC.api('/recorrentes'), CC.api(`/recorrentes/previa?mes=${mes}`),
        CC.api(`/recorrentes/previa?mes=${CC.mesSoma(mes, 1)}`), F.perms()]);
    } catch (error) { return CC.errorScreen(el, error, () => CC.screens.recorrentes(params)); }
    const modelos = Array.isArray(lista) ? lista : [];
    const pode = F.podeCadastrar();
    const ativos = modelos.filter((m) => m.ativo).length;
    const novo = pode ? `<button class="back" type="button" id="rec-novo" aria-label="Novo recorrente">${icon('plus', 22)}</button>` : '';
    const page = CC.render(`${F.top('Recorrentes', `${F.plural(ativos, 'ativo', 'ativos')} de ${F.plural(modelos.length, 'modelo', 'modelos')}`, novo)}
      ${gerarCard(atual, pode)}
      ${modelos.length ? `<div class="rows">${modelos.map((m) => linha(m, pode)).join('')}</div>` : `<div class="empty">${icon('arrow-clockwise', 28)}Nenhum recorrente cadastrado ainda.</div>`}
      ${proximas(prox)}`, true, params);
    F.voltar(page, voltar);
    const recarregar = () => CC.screens.recorrentes({ __nav: params.__nav });
    const bNovo = CC.$('#rec-novo', page);
    if (bNovo) bNovo.addEventListener('click', () => CC.go('recorrente', {}));
    const bGerar = CC.$('#rec-gerar', page);
    if (bGerar) bGerar.addEventListener('click', () => gerarSheet(atual, recarregar));
    CC.$$('[data-rec]', page).forEach((b) => b.addEventListener('click', () => CC.go('recorrente', { modelo: modelos.find((m) => String(m.id) === b.dataset.rec) })));
    CC.$$('[data-pausar]', page).forEach((b) => b.addEventListener('click', async () => {
      const m = modelos.find((x) => String(x.id) === b.dataset.pausar);
      CC.busy(b, m.ativo ? 'Pausando…' : 'Reativando…');
      try { await CC.api(`/recorrentes/${m.id}`, { method: 'PUT', body: F.corpoRecorrente(m, { ativo: !m.ativo }) }); } catch (error) {
        CC.toast(error.status === 0 ? 'Sem internet. Esta ação precisa da conexão.' : error.message, 'warning-circle');
        return F.solta(b, m.ativo ? '' : 'play', m.ativo ? 'Pausar' : 'Reativar');
      }
      CC.toast(m.ativo ? 'Recorrente pausado' : 'Recorrente reativado');
      return recarregar();
    }));
    return undefined;
  };

  // Mostra o que sera criado antes de gravar. O planToken garante que a previa nao mudou.
  function gerarSheet(previa, recarregar) {
    const nome = F.mesCurto(previa.mes);
    const sh = CC.sheet('rec-sheet', `${CC.sheetHead('plus-circle', `Gerar ${F.plural(previa.total_itens, 'lançamento', 'lançamentos')} de ${nome}?`)}
      <p class="od-txt">Todos entram como "A pagar", com vencimento no dia de cada modelo. Dá para editar ou excluir depois, como qualquer lançamento.</p>
      ${previa.itens.map((i) => `<div class="tx"><span class="grow"><b>${esc(i.descricao)}</b><small>${esc(`${CC.dateFull(i.data)} · ${i.obra}`)}</small></span><span class="amt">${esc(money(i.valor))}</span></div>`).join('')}
      <div class="lanc-err"></div>
      <div class="grid2 od-acts"><button class="btn2" type="button" id="rg-cancel">Cancelar</button><button class="btn" type="button" id="rg-ok">${icon('check', 18)}Gerar</button></div>`);
    CC.$('#rg-cancel', sh.el).addEventListener('click', sh.close);
    CC.$('#rg-ok', sh.el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      CC.busy(b, 'Gerando…');
      let data;
      try { ({ data } = await CC.api('/recorrentes/gerar', { method: 'POST', body: { mes: previa.mes, planToken: previa.planToken } })); } catch (error) {
        F.solta(b, 'check', 'Gerar');
        CC.$('.lanc-err', sh.el).innerHTML = CC.sheetErr(error);
        return;
      }
      sh.close();
      CC.toast(`${F.plural(data.gerados, 'lançamento gerado', 'lançamentos gerados')} em ${nome}`);
      recarregar();
    });
  }
})(window.CC = window.CC || {});
