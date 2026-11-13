// Logistica › Ferramental: inventario com busca e filtro (devolucao, avaliacao, historico) e o kit padrao dos tecnicos.
(function (CC) {
  const { esc, icon } = CC;
  const F = CC.fin, L = CC.logi;
  const SUBS = [['inventario', 'Inventário'], ['kit', 'Kit padrão']];

  function devolver(ctx, id, nome) {
    L.folha({
      icone: 'arrow-counter-clockwise', titulo: 'Registrar devolução', ok: 'Registrar devolução',
      corpo: `<p class="sub lgo-ctx">${esc(nome)}</p>${L.select('Condição', 'condicao', [['boa', 'Boa'], ['avariada', 'Avariada']], 'boa')}
        ${L.area('Observação (obrigatória se houver avaria)', 'observacao')}`,
      aoEnviar: async (form) => {
        const condicao = form.elements.condicao.value, observacao = form.elements.observacao.value.trim();
        if (condicao === 'avariada' && observacao.length < 5) throw L.falha('observacao', 'Observação: descreva a avaria em pelo menos 5 caracteres.');
        await CC.api(`/logistica/ferramentas/${encodeURIComponent(id)}/devolucao`, { method: 'POST', body: { condicao, observacao } });
        CC.toast('Devolução registrada');
      },
      feito: ctx.atualizar,
    });
  }

  function avaliar(ctx, id, nome) {
    L.folha({
      icone: 'wrench', titulo: 'Avaliar ferramenta', ok: 'Salvar avaliação',
      corpo: `<p class="sub lgo-ctx">${esc(nome)}</p>${L.select('Resultado', 'resultado', [['reparada', 'Reparada'], ['baixada', 'Baixada']], 'reparada')}
        ${L.area('Reparo ou motivo da baixa', 'motivo')}`,
      aoEnviar: async (form) => {
        const body = { resultado: form.elements.resultado.value, motivo: L.texto(form, 'motivo', 'Reparo ou motivo da baixa', 5) };
        await CC.api(`/logistica/ferramentas/${encodeURIComponent(id)}/avaliacao`, { method: 'POST', body });
        CC.toast('Avaliação registrada');
      },
      feito: ctx.atualizar,
    });
  }

  async function historico(id, nome) {
    const sh = L.folhaInfo('arrow-counter-clockwise', `Histórico: ${nome}`, '<div class="skeleton"></div>');
    try {
      const { data } = await CC.api(`/logistica/ferramentas/${encodeURIComponent(id)}/historico`);
      if (!sh.el.isConnected) return;
      CC.$('.lgo-form', sh.el).innerHTML = data.length ? data.map((r) => L.item({ titulo: L.movimento(r.tipo), linhas: [`${L.data(r.criado_em)} · ${r.ator || 'Sem responsável registrado'}`, L.detalhe(r.detalhe)] })).join('')
        : L.vazio('arrow-counter-clockwise', 'Sem movimentações.');
    } catch (error) {
      if (sh.el.isConnected) CC.$('.lgo-form', sh.el).innerHTML = CC.sheetErr(error);
    }
  }

  function inventario(ctx, slot) {
    const lista = ctx.dados.ferramentas, e = ctx.estado;
    slot.innerHTML = `${F.busca('lg-busca', e.busca, 'Nome, código ou local')}
      <label class="field"><span>Situação</span><select id="lg-status">${L.STATUS.map(([v, r]) => `<option value="${v}"${v === e.status ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      <p class="sub lgo-nota" id="lg-contagem" aria-live="polite"></p><div class="lgo-lista" id="lg-itens"></div>`;
    const itens = CC.$('#lg-itens', slot);
    const pintar = () => {
      const q = e.busca.trim().toLowerCase();
      const visiveis = lista.filter((i) => (!e.status || i.situacao === e.status) && (!q || [i.nome, i.codigo, L.local(i.localizacao), i.tecnico || ''].join(' ').toLowerCase().includes(q)));
      itens.innerHTML = visiveis.length ? visiveis.map((i) => {
        const extra = ` data-nome="${esc(i.nome)}"`;
        return L.item({
          titulo: i.nome, tags: L.situacao(i.situacao), linhas: [`Código ${i.codigo}`, i.tecnico_id ? `Com ${i.tecnico}` : `Local: ${L.local(i.localizacao)}`],
          botoes: `${i.situacao === 'com_tecnico' ? L.botao('devolver', i.id, 'Devolução', i.nome, extra) : ''}${i.situacao === 'em_avaliacao' ? L.botao('avaliar', i.id, 'Avaliar', i.nome, extra) : ''}${L.botao('historico', i.id, 'Histórico', i.nome, extra)}`,
        });
      }).join('') : L.vazio('wrench', lista.length ? 'Nenhuma ferramenta encontrada. Ajuste a busca ou a situação.' : 'Nenhuma ferramenta no inventário. Use Cadastrar ferramenta.');
      CC.$('#lg-contagem', slot).textContent = `${visiveis.length} de ${lista.length} ferramentas`;
    };
    F.ligarBusca(slot, 'lg-busca', (texto) => { e.busca = texto; pintar(); });
    CC.$('#lg-status', slot).addEventListener('change', (ev) => { e.status = ev.target.value; pintar(); });
    itens.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-devolver],button[data-avaliar],button[data-historico]');
      if (!b) return;
      if (b.dataset.devolver) devolver(ctx, b.dataset.devolver, b.dataset.nome);
      else if (b.dataset.avaliar) avaliar(ctx, b.dataset.avaliar, b.dataset.nome);
      else historico(b.dataset.historico, b.dataset.nome);
    });
    pintar();
  }

  const linhaKit = (nome, quantidade) => `<div class="lgo-kit-item" data-kit-item>
    <label class="field"><span>Ferramenta</span><input name="nome" value="${esc(nome)}" maxlength="120" autocomplete="off" enterkeyhint="next"></label>
    <label class="field"><span>Qtd.</span><input name="quantidade" type="number" inputmode="numeric" min="1" max="50" step="1" value="${esc(quantidade)}" enterkeyhint="done"></label>
    <button type="button" class="back" data-remover aria-label="Remover item do kit">${icon('trash', 20)}</button></div>`;

  // Confere o kit antes de enviar; devolve os itens ou lanca o erro com o item e o motivo.
  function lerKit(slot) {
    const nomes = new Set();
    return CC.$$('[data-kit-item]', slot).map((linha, n) => {
      const campoNome = CC.$('[name=nome]', linha), campoQtd = CC.$('[name=quantidade]', linha);
      const nome = campoNome.value.trim(), quantidade = Number(campoQtd.value);
      const falha = (campo, motivo) => Object.assign(new Error(`Item ${n + 1}${nome ? ` (${nome})` : ''}: ${motivo}`), { alvo: campo });
      if (!nome) throw falha(campoNome, 'informe o nome da ferramenta.');
      if (nomes.has(nome.toLowerCase())) throw falha(campoNome, 'este nome já está no kit; junte na quantidade.');
      if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 50) throw falha(campoQtd, 'a quantidade deve ser um número inteiro de 1 a 50.');
      nomes.add(nome.toLowerCase());
      return { nome, quantidade };
    });
  }

  function kit(ctx, slot) {
    slot.innerHTML = `<p class="sub lgo-nota">Defina o que cada kit deve conter. Extras individuais são registrados em cada entrega.</p>
      <form id="lg-kit" novalidate><div class="lgo-kit-lista" id="lg-kit-lista">${ctx.dados.kit.itens.map((i) => linhaKit(i.nome, i.quantidade)).join('')}</div>
      <div id="lg-kit-erro"></div>
      <div class="lgo-acoes"><button type="button" class="btn2" id="lg-kit-mais">${icon('plus', 18)}Adicionar item</button><button type="submit" class="btn">Salvar kit padrão</button></div></form>`;
    const lista = CC.$('#lg-kit-lista', slot), erro = CC.$('#lg-kit-erro', slot), salvar = CC.$('[type=submit]', slot);
    CC.$('#lg-kit-mais', slot).addEventListener('click', () => { lista.insertAdjacentHTML('beforeend', linhaKit('', 1)); CC.$('input', lista.lastElementChild).focus(); });
    lista.addEventListener('click', (ev) => { const b = ev.target.closest('[data-remover]'); if (b) b.closest('[data-kit-item]').remove(); });
    CC.$('#lg-kit', slot).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (salvar.disabled) return;
      erro.innerHTML = '';
      CC.$$('.bad', slot).forEach((f) => f.classList.remove('bad'));
      try {
        const itens = lerKit(slot);
        CC.busy(salvar, 'Salvando…');
        await CC.api('/logistica/kits/padrao', { method: 'PUT', body: { itens } });
      } catch (error) {
        salvar.disabled = false;
        salvar.textContent = 'Salvar kit padrão';
        erro.innerHTML = CC.sheetErr(error);
        if (error.alvo) { error.alvo.closest('.field').classList.add('bad'); error.alvo.focus(); }
        return;
      }
      CC.toast('Kit padrão atualizado');
      ctx.atualizar();
    });
  }

  L.modulos.ferramental = {
    dados: (e) => (e.sub.ferramental === 'kit' ? ['kit'] : ['ferramentas']),
    acoes: [
      ['wrench', 'Entregar ferramentas', (ctx) => L.checklist(ctx, 'entrega')],
      ['plus', 'Cadastrar ferramenta', (ctx) => L.cadastrarFerramenta(ctx)],
      ['list-checks', 'Conferência inicial', (ctx) => L.checklist(ctx, 'conferencia')],
    ],
    desenhar(ctx) {
      ctx.corpo.innerHTML = `${L.seg(ctx, 'ferramental', SUBS, 'Visão do ferramental')}<div class="lgo-corpo" id="lg-sub"></div>`;
      L.ligarSeg(ctx, 'ferramental');
      const slot = CC.$('#lg-sub', ctx.corpo);
      if (ctx.estado.sub.ferramental === 'kit') kit(ctx, slot); else inventario(ctx, slot);
    },
  };
})(window.CC = window.CC || {});
