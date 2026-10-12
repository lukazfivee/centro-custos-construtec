// Detalhe de uma cobranca: valor, vencimento, dados, andamento em 4 passos e proximo passo.
// Tres pontos: editar dados, e-mail ao cliente e excluir (reversivel). Mesmas rotas do desktop
// (public/d/telas/cobranca-painel.js e cobranca-excluir.js). Salvar e excluir exigem p6 no servidor
// (routes/cloudSync.js); o desktop libera salvar so para p5, aqui vale a regra do servidor.
(function (CC) {
  const { esc, icon, money } = CC;
  const B = CC.cobr;
  const F = CC.fin;

  // Item da lista em memoria; sem ele (lista ainda nao carregada), busca de novo.
  B.abrirItem = async (id) => B.achar(id) || (await B.carregar(), B.achar(id));

  CC.screens.cobranca = async function (params) {
    const id = String((params && params.id) || '');
    const voltar = () => CC.go('cobrancas');
    const el = F.carregando('Cobrança', '', voltar);
    let item;
    try { [item] = await Promise.all([B.abrirItem(id), F.perms()]); } catch (error) {
      return CC.errorScreen(el, { status: error.status, message: B.semNuvem(error) }, () => CC.screens.cobranca(params));
    }
    if (!item) { CC.toast('Esta cobrança não está mais na lista.', 'warning-circle'); return voltar(); }
    const pode = F.can('p6');
    const venc = B.vencida(item);
    const prox = B.proximo(item);
    const linha = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    const mais = pode ? `<button class="back" type="button" id="cob-mais" aria-label="Mais ações" aria-haspopup="dialog">${icon('dots-three', 22)}</button>` : '';
    const page = CC.render(`${F.top(item.name, [item.code, B.cliente(item)].filter(Boolean).join(' · '), mais)}
      <div class="grid2"><div class="card"><span class="label">Valor</span><b class="fin-num">${esc(money(item.receivableAmount))}</b></div>
        <div class="card"><span class="label">Vencimento</span><b class="fin-num${venc ? ' warn-txt' : ''}">${esc(CC.dateFull(item.dueDate) || '—')}</b></div></div>
      <div class="card">${linha('Situação', B.textoFin(item))}${linha('Obra', B.textoOp(item))}${linha('Cliente', B.cliente(item) || '—')}
        ${linha('Contato financeiro', (item.clientEmails || []).join(', ') || '—')}${linha('Responsável', item.responsible || '—')}
        ${linha('Conclusão', CC.dateFull(item.completionDate) || '—')}${linha('Nota fiscal', item.invoiceNumber || 'Ainda não emitida')}
        ${Number(item.contractAmount) ? linha('Valor do contrato', money(item.contractAmount)) : ''}</div>
      ${item.notes ? `<div class="card"><span class="label">Observações</span><p class="lanc-obs">${esc(item.notes)}</p></div>` : ''}
      <span class="label">Andamento</span>${B.passosHtml(item)}
      <div class="card fin-prox"><span class="label">Próximo passo</span><b>${esc(prox.texto)}</b>
        ${pode && prox.acao ? `<button class="btn" type="button" id="cob-prox">${icon(prox.icone, 18)}${esc(prox.rotulo)}</button>` : ''}</div>
      <p class="alert" role="alert" id="err"></p>
      <div class="actions"><button class="btn2" type="button" id="cob-email">${icon('envelope-simple', 18)}E-mail ao cliente</button>
        ${pode ? `<button class="btn2" type="button" id="cob-dados">${icon('pencil-simple', 18)}Editar dados</button>` : ''}</div>`, true, params);
    document.body.classList.add('no-tabs');
    F.voltar(page, voltar);
    const recarregar = () => CC.screens.cobranca({ id, __nav: params.__nav });
    CC.$('#cob-email', page).addEventListener('click', () => CC.go('cobranca-email', { id }));
    const dados = CC.$('#cob-dados', page);
    if (dados) dados.addEventListener('click', () => CC.go('cobranca-dados', { id }));
    const bProx = CC.$('#cob-prox', page);
    if (bProx) bProx.addEventListener('click', () => executar(item, prox, bProx, page, recarregar));
    const m = CC.$('#cob-mais', page);
    if (m) m.addEventListener('click', () => menu(item, voltar));
    return undefined;
  };

  async function executar(item, prox, b, page, recarregar) {
    F.erro(page, '');
    if (prox.acao === 'email') return CC.go('cobranca-email', { id: item.publicId });
    if (prox.acao === 'nf' && !String(item.invoiceNumber || '').trim()) {
      return CC.go('cobranca-dados', { id: item.publicId, foco: 'cd-nf', aviso: 'Informe o número da NF e escolha a situação NF emitida.' });
    }
    if (prox.acao === 'pagar') return pagarSheet(item, recarregar);
    CC.busy(b, 'Salvando…');
    try {
      if (prox.acao === 'aprovar') await B.salvar(item, { operationalStatus: 'finalizada' });
      else await B.salvar(item, { financialStatus: 'nf_emitida' });
    } catch (error) { F.solta(b, prox.icone, prox.rotulo); return F.erro(page, error.status === 0 ? 'Sem internet. Atualizar a cobrança precisa da conexão.' : error); }
    CC.toast(prox.acao === 'aprovar' ? 'Medição marcada como aprovada' : 'NF marcada como emitida');
    return recarregar();
  }

  const errSheet = (sh, error) => { const slot = CC.$('.lanc-err', sh.el); if (slot) slot.innerHTML = error ? CC.sheetErr(error) : ''; };

  function pagarSheet(item, recarregar) {
    const sh = CC.sheet('cob-sheet', `${CC.sheetHead('check', 'Registrar o pagamento?')}
      <p class="od-txt">A cobrança de ${esc(item.name)} passa a Paga.</p><div class="lanc-err"></div>
      <div class="grid2 od-acts"><button class="btn2" type="button" id="cp-cancel">Cancelar</button><button class="btn" type="button" id="cp-ok">${icon('check', 18)}Registrar</button></div>`);
    CC.$('#cp-cancel', sh.el).addEventListener('click', sh.close);
    CC.$('#cp-ok', sh.el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      CC.busy(b, 'Salvando…');
      try { await B.salvar(item, { financialStatus: 'pago' }); } catch (error) { F.solta(b, 'check', 'Registrar'); return errSheet(sh, error); }
      sh.close();
      CC.toast('Pagamento registrado');
      return recarregar();
    });
  }

  function menu(item, voltar) {
    const it = (idb, ic, t, s, cls) => `<button type="button" class="suite-item om-item${cls ? ` ${cls}` : ''}" id="${idb}">${icon(ic, 22)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`;
    const sh = CC.sheet('cob-sheet', `${CC.sheetHead('envelope-simple', item.name)}
      ${it('cm-dados', 'pencil-simple', 'Editar dados do acompanhamento', 'Cliente, e-mails, NF, situações, valores e datas')}
      ${it('cm-email', 'envelope-simple', 'E-mail ao cliente', 'Rascunho, autorização e envio com a NF')}
      ${it('cm-del', 'trash', 'Excluir cobrança', 'Sai da lista e dos indicadores; dá para restaurar', 'danger')}`);
    CC.$('#cm-dados', sh.el).addEventListener('click', () => { sh.close(); CC.go('cobranca-dados', { id: item.publicId }); });
    CC.$('#cm-email', sh.el).addEventListener('click', () => { sh.close(); CC.go('cobranca-email', { id: item.publicId }); });
    CC.$('#cm-del', sh.el).addEventListener('click', () => excluirSheet(item, voltar));
  }

  // Excluir so marca a cobranca como excluida no servico corporativo: obra, lancamentos, medicoes e NF ficam.
  function excluirSheet(item, voltar) {
    const sens = B.sensivel(item);
    const sh = CC.sheet('cob-sheet', `${CC.sheetHead('trash', 'Excluir esta cobrança?')}
      <p class="muted od-sub">${esc(`${item.code} · ${money(item.receivableAmount)} · ${B.textoFin(item)}`)}</p>
      <p class="od-txt">A obra, os lançamentos, as medições e a NF não são apagados. A cobrança sai da lista e dos indicadores, e dá para restaurar em Excluídas.</p>
      ${sens ? `<div class="note off">${icon('warning-circle', 18)}<span>Esta cobrança já foi enviada ou paga. Excluir tira ela do acompanhamento financeiro.</span></div>` : ''}
      <label class="field" style="margin-top:12px"><span>Motivo (opcional)</span><input id="cx-motivo" maxlength="300" autocomplete="off" placeholder="Ex.: cobrança duplicada"></label>
      <div class="lanc-err"></div>
      <div class="grid2 od-acts"><button class="btn2" type="button" id="cx-cancel">Cancelar</button><button class="btn danger" type="button" id="cx-ok">${icon('trash', 18)}${sens ? 'Excluir mesmo assim' : 'Excluir'}</button></div>`);
    CC.$('#cx-cancel', sh.el).addEventListener('click', sh.close);
    CC.$('#cx-ok', sh.el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      CC.busy(b, 'Excluindo…');
      try { await CC.api(B.url(item, 'excluir'), { method: 'POST', body: { motivo: CC.$('#cx-motivo', sh.el).value.trim() } }); } catch (error) {
        F.solta(b, 'trash', sens ? 'Excluir mesmo assim' : 'Excluir');
        return errSheet(sh, error);
      }
      sh.close();
      B.lista = B.lista.filter((x) => x.publicId !== item.publicId);
      CC.toast('Cobrança excluída · dá para restaurar em Excluídas');
      return voltar();
    });
  }
})(window.CC = window.CC || {});
