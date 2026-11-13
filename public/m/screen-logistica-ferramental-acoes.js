// Logistica › folhas do ferramental: cadastrar ferramenta, entregar ferramentas e conferencia inicial.
// A ficha em papel (imprimir para assinar) fica no computador; no celular o tecnico assina em Meu kit.
(function (CC) {
  const { esc } = CC;
  const L = CC.logi;

  L.cadastrarFerramenta = (ctx) => L.folha({
    icone: 'plus', titulo: 'Cadastrar ferramenta', ok: 'Adicionar ao inventário',
    corpo: `${L.campo('Nome', 'nome', 'maxlength="120" autocomplete="off" autocapitalize="sentences" enterkeyhint="next"')}
      ${L.campo('Código de patrimônio', 'codigo', 'maxlength="80" autocomplete="off" autocapitalize="characters" enterkeyhint="done"')}`,
    aoEnviar: async (form) => {
      const body = { nome: L.texto(form, 'nome', 'Nome'), codigo: L.texto(form, 'codigo', 'Código de patrimônio') };
      await CC.api('/logistica/ferramentas', { method: 'POST', body });
      CC.toast('Ferramenta adicionada ao inventário');
    },
    feito: () => { ctx.estado.aba = 'ferramental'; ctx.estado.sub.ferramental = 'inventario'; ctx.atualizar(); },
  });

  const MODOS = {
    entrega: {
      icone: 'wrench', titulo: 'Entregar ferramentas ao técnico', ok: 'Registrar entrega', legenda: 'Ferramentas disponíveis',
      ajuda: 'A saída do estoque acontece ao registrar a entrega física. O técnico recebe a ficha para assinar no celular, em Meu kit.',
      vazio: 'Não há ferramentas disponíveis no momento.', rota: '/logistica/entregas', aviso: 'Entrega registrada e aguardando assinatura',
    },
    conferencia: {
      icone: 'list-checks', titulo: 'Conferência inicial', ok: 'Gerar ficha de conferência', legenda: 'Ferramentas confirmadas com o técnico',
      ajuda: 'Registre a posse atual com a data de hoje. O técnico recebe a ficha para assinar no celular, em Meu kit.',
      vazio: 'Nenhuma ferramenta disponível para conferir.', rota: '/logistica/conferencias-iniciais', aviso: 'Ficha de conferência criada',
    },
  };

  // modo: 'entrega' ou 'conferencia'. Lista as ferramentas disponiveis com filtro e contagem.
  L.checklist = async (ctx, modo) => {
    const m = MODOS[modo];
    let tecnicos, ferramentas;
    try {
      [tecnicos, ferramentas] = (await Promise.all([CC.api('/logistica/tecnicos'), CC.api('/logistica/ferramentas')])).map((r) => r.data);
    } catch (error) { return L.aviso(error, 'Não foi possível abrir o formulário.'); }
    if (!ctx.page.isConnected) return undefined;
    const disponiveis = ferramentas.filter((item) => item.situacao === 'disponivel');
    const lista = disponiveis.map((item) => `<label class="lgo-check" data-texto="${esc([item.nome, item.codigo].join(' ').toLowerCase())}">
      <input type="checkbox" name="ferramentaIds" value="${esc(item.id)}"><span>${esc(item.nome)}<small>${esc(item.codigo)}</small></span></label>`).join('');
    const selo = L.idem();
    return L.folha({
      icone: m.icone, titulo: m.titulo, ok: m.ok,
      corpo: `<p class="sub lgo-ctx">${esc(m.ajuda)}</p>${L.select('Técnico responsável', 'tecnicoId', L.opcoes(tecnicos, 'id', 'nome', 'Selecione o técnico'), '')}
        <fieldset class="lgo-grupo"><legend>${esc(m.legenda)}</legend>${disponiveis.length ? `<label class="field"><span class="sr">Filtrar ferramentas</span>
          <input type="search" data-filtro placeholder="Filtrar por nome ou código" enterkeyhint="search" autocomplete="off"></label>
          <div class="lgo-checks">${lista}</div><p class="sub lgo-nota" data-contagem aria-live="polite">Nenhuma selecionada</p>` : `<p class="sub lgo-nota">${esc(m.vazio)}</p>`}</fieldset>`,
      aoAbrir: (form) => {
        const filtro = CC.$('[data-filtro]', form), contagem = CC.$('[data-contagem]', form);
        if (!filtro) return;
        filtro.addEventListener('input', () => { const q = filtro.value.trim().toLowerCase(); CC.$$('.lgo-check', form).forEach((l) => { l.hidden = !!q && !l.dataset.texto.includes(q); }); });
        filtro.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); filtro.blur(); } });
        form.addEventListener('change', () => { const n = CC.$$('[name=ferramentaIds]:checked', form).length; contagem.textContent = n ? `${n} selecionada${n > 1 ? 's' : ''}` : 'Nenhuma selecionada'; });
      },
      aoEnviar: async (form) => {
        const tecnicoId = L.escolha(form, 'tecnicoId', 'Técnico responsável');
        const ferramentaIds = CC.$$('[name=ferramentaIds]:checked', form).map((c) => Number(c.value));
        if (!ferramentaIds.length) throw L.falha('ferramentaIds', `${m.legenda}: selecione pelo menos uma ferramenta.`);
        await CC.api(m.rota, { method: 'POST', body: selo({ tecnicoId, ferramentaIds }) });
        CC.toast(m.aviso);
      },
      feito: ctx.atualizar,
    });
  };
})(window.CC = window.CC || {});
