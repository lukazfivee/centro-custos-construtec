// Formularios do ferramental em dialogo: cadastrar, entregar ferramentas e conferencia inicial.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const L = D.logi;
  const { esc } = CC;

  L.cadastrarFerramenta = async (ctx) => {
    const feito = await L.dialogoFormulario({
      titulo: 'Cadastrar ferramenta', ok: 'Adicionar ao inventário',
      corpo: `${U.campo({ rotulo: 'Nome', name: 'nome', obrigatorio: true })}${U.campo({ rotulo: 'Código de patrimônio', name: 'codigo', obrigatorio: true })}`,
      aoEnviar: async (form) => {
        const body = { nome: form.elements.nome.value.trim(), codigo: form.elements.codigo.value.trim() };
        await CC.api('/logistica/ferramentas', { method: 'POST', body });
        CC.toast('Ferramenta adicionada ao inventário');
      },
    });
    if (feito) { ctx.estado.aba = 'ferramental'; ctx.estado.sub.ferramental = 'inventario'; ctx.atualizar(); }
  };

  const MODOS = {
    entrega: {
      titulo: 'Entregar ferramentas ao técnico', ok: 'Registrar e imprimir ficha', legenda: 'Ferramentas disponíveis',
      ajuda: 'A saída do estoque acontece ao registrar a entrega física. O técnico recebe a ficha para assinar no celular.',
      vazio: 'Não há ferramentas disponíveis no momento.', rota: '/logistica/entregas', aviso: 'Entrega registrada e aguardando assinatura',
    },
    conferencia: {
      titulo: 'Conferência inicial', ok: 'Gerar ficha de conferência', legenda: 'Ferramentas confirmadas com o técnico',
      ajuda: 'Registre a posse atual com a data de hoje e envie a ficha para assinatura do técnico.',
      vazio: 'Nenhuma ferramenta disponível para conferir.', rota: '/logistica/conferencias-iniciais', aviso: 'Ficha de conferência criada',
    },
  };

  // modo: 'entrega' ou 'conferencia'. Lista as ferramentas disponiveis com busca e contagem.
  L.checklist = async (ctx, modo) => {
    const m = MODOS[modo];
    let tecnicos, ferramentas;
    try {
      [tecnicos, ferramentas] = (await Promise.all([CC.api('/logistica/tecnicos'), CC.api('/logistica/ferramentas')])).map((r) => r.data);
    } catch (error) { return CC.toast(error.message || 'Não foi possível abrir o formulário.'); }
    const disponiveis = ferramentas.filter((item) => item.situacao === 'disponivel');
    const lista = disponiveis.map((item) => `<label class="logi-escolha" data-texto="${esc([item.nome, item.codigo].join(' ').toLowerCase())}"><input type="checkbox" name="ferramentaIds" value="${esc(item.id)}"><span>${esc(item.nome)} · ${esc(item.codigo)}</span></label>`).join('');
    const corpo = `<p class="muted">${esc(m.ajuda)}</p>${U.campo({ rotulo: 'Técnico responsável', name: 'tecnicoId', tipo: 'select', obrigatorio: true, opcoes: [{ valor: '', rotulo: 'Selecione o técnico' }, ...tecnicos.map((t) => ({ valor: t.id, rotulo: t.nome }))] })}
      <fieldset class="logi-lista"><legend>${esc(m.legenda)}</legend>${disponiveis.length ? `<input class="inp" type="search" data-filtro placeholder="Filtrar por nome ou código" aria-label="Filtrar ferramentas"><div class="logi-checklist">${lista}</div><small class="muted" data-contagem aria-live="polite">Nenhuma selecionada</small>` : `<p class="muted">${esc(m.vazio)}</p>`}</fieldset>`;
    let recibo = null;
    const feito = await L.dialogoFormulario({
      titulo: m.titulo, ok: m.ok, corpo,
      aoAbrir: (form) => {
        const filtro = CC.$('[data-filtro]', form), contagem = CC.$('[data-contagem]', form);
        if (!filtro) return;
        filtro.addEventListener('input', () => { const q = filtro.value.trim().toLowerCase(); CC.$$('.logi-escolha', form).forEach((l) => { l.hidden = !!q && !l.dataset.texto.includes(q); }); });
        form.addEventListener('change', () => { const n = CC.$$('[name=ferramentaIds]:checked', form).length; contagem.textContent = n ? `${n} selecionada${n > 1 ? 's' : ''}` : 'Nenhuma selecionada'; });
      },
      aoEnviar: async (form) => {
        const body = { tecnicoId: Number(form.elements.tecnicoId.value), ferramentaIds: CC.$$('[name=ferramentaIds]:checked', form).map((c) => Number(c.value)), client_id: CC.uuid() };
        if (!body.ferramentaIds.length) throw new Error('Selecione pelo menos uma ferramenta.');
        const { data } = await CC.api(m.rota, { method: 'POST', body });
        recibo = { ...data, tecnico: tecnicos.find((t) => t.id === body.tecnicoId)?.nome || 'Técnico' };
        CC.toast(m.aviso);
      },
    });
    if (feito) { ctx.atualizar(); if (recibo) L.ficha(recibo); }
  };
})(window.CC);
