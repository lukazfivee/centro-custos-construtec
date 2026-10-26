// Aba Ferramental: inventario com busca e filtro, e o kit padrao dos tecnicos.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const L = D.logi;
  const { esc } = CC;
  const SUBS = [{ valor: 'inventario', rotulo: 'Inventário' }, { valor: 'kit', rotulo: 'Kit padrão' }];
  const STATUS = [['', 'Todas'], ['disponivel', 'Disponível'], ['com_tecnico', 'Com técnico'], ['em_falta', 'Em falta'], ['em_avaliacao', 'Em avaliação'], ['baixada', 'Baixada']];

  const campoLinha = (rotulo, tipo, nome, extra) => `<label class="fld"><span>${esc(rotulo)}</span><input class="inp" name="${nome}" type="${tipo}" ${extra}></label>`;
  const linhaKit = (nome, quantidade) => `<div class="logi-kit-item" data-kit-item>${campoLinha('Ferramenta', 'text', 'nome', `value="${esc(nome)}" required maxlength="120"`)}${campoLinha('Qtd.', 'number', 'quantidade', `min="1" max="50" value="${esc(quantidade)}" required`)}<button type="button" class="ibtn" data-remover aria-label="Remover item do kit">${D.ic('trash')}</button></div>`;

  function devolver(ctx, id, nome) {
    L.dialogoFormulario({
      titulo: 'Registrar devolução', ok: 'Registrar',
      corpo: `<p class="muted">${esc(nome)}</p>${U.campo({ rotulo: 'Condição', name: 'condicao', tipo: 'select', opcoes: [{ valor: 'boa', rotulo: 'Boa' }, { valor: 'avariada', rotulo: 'Avariada' }] })}${U.campo({ rotulo: 'Observação da devolução (obrigatória se houver avaria)', name: 'observacao', tipo: 'textarea' })}`,
      aoEnviar: async (form) => {
        const condicao = form.elements.condicao.value, observacao = form.elements.observacao.value.trim();
        if (condicao === 'avariada' && !observacao) throw new Error('Descreva a avaria para continuar.');
        await CC.api(`/logistica/ferramentas/${id}/devolucao`, { method: 'POST', body: { condicao, observacao } });
        CC.toast('Devolução registrada');
      },
    }).then((feito) => { if (feito) ctx.atualizar(); });
  }

  function avaliar(ctx, id, nome) {
    L.dialogoFormulario({
      titulo: 'Avaliar ferramenta', ok: 'Salvar avaliação',
      corpo: `<p class="muted">${esc(nome)}</p>${U.campo({ rotulo: 'Resultado', name: 'resultado', tipo: 'select', opcoes: [{ valor: 'reparada', rotulo: 'Reparada' }, { valor: 'baixada', rotulo: 'Baixada' }] })}${U.campo({ rotulo: 'Reparo ou motivo da baixa', name: 'motivo', tipo: 'textarea', obrigatorio: true })}`,
      aoEnviar: async (form) => {
        await CC.api(`/logistica/ferramentas/${id}/avaliacao`, { method: 'POST', body: { resultado: form.elements.resultado.value, motivo: form.elements.motivo.value.trim() } });
        CC.toast('Avaliação registrada');
      },
    }).then((feito) => { if (feito) ctx.atualizar(); });
  }

  async function historico(id, nome) {
    try {
      const { data } = await CC.api(`/logistica/ferramentas/${id}/historico`);
      L.dialogoInfo({ titulo: `Histórico: ${nome}`, corpo: `<div class="logi-rolagem" data-legenda="${esc(`Movimentações de ${nome}`)}">${U.tabela({ vazio: 'Sem movimentações.', vazioIcone: 'clock-counter-clockwise', colunas: [{ rotulo: 'Data' }, { rotulo: 'Movimento' }, { rotulo: 'Responsável' }, { rotulo: 'Detalhe' }],
        linhas: data.map((r) => ({ celulas: [esc(L.data(r.criado_em)), esc(L.movimento(r.tipo)), esc(r.ator || '—'), esc(L.detalhe(r.detalhe))] })) })}</div>` });
    } catch (error) { CC.toast(error.message || 'Não foi possível abrir o histórico.'); }
  }

  function inventario(ctx) {
    const lista = ctx.dados.ferramentas, e = ctx.estado;
    const pintar = () => {
      const q = e.busca.trim().toLowerCase();
      const visiveis = lista.filter((i) => (!e.status || i.situacao === e.status) && (!q || [i.nome, i.codigo, i.localizacao].join(' ').toLowerCase().includes(q)));
      CC.$('[data-itens]', ctx.corpo).innerHTML = L.cartao(U.tabela({
        vazio: 'Nenhuma ferramenta encontrada. Ajuste a busca ou cadastre uma unidade no inventário.', vazioIcone: 'wrench',
        colunas: [{ rotulo: 'Ferramenta' }, { rotulo: 'Código' }, { rotulo: 'Situação' }, { rotulo: 'Local / responsável' }, { rotulo: 'Ações' }],
        linhas: visiveis.map((i) => ({ celulas: [esc(i.nome), esc(i.codigo), L.situacao(i.situacao), esc(i.tecnico_id ? i.tecnico : L.local(i.localizacao)),
          `${i.situacao === 'com_tecnico' ? L.botaoLinha('devolver', i.id, 'Devolução', i.nome, ` data-nome="${esc(i.nome)}"`) : ''}${i.situacao === 'em_avaliacao' ? L.botaoLinha('avaliar', i.id, 'Avaliar', i.nome, ` data-nome="${esc(i.nome)}"`) : ''}${L.botaoLinha('historico', i.id, 'Histórico', i.nome, ` data-nome="${esc(i.nome)}"`)}`] })),
      }), true, 'Ferramentas do inventário');
      L.rotular(ctx.corpo);
      CC.$('[data-contagem]', ctx.corpo).textContent = `${visiveis.length} de ${lista.length} ferramentas`;
    };
    CC.$('[data-corpo-sub]', ctx.corpo).innerHTML = `<section class="card logi-filtros"><label class="fld"><span>Buscar</span><input class="inp" data-busca type="search" value="${esc(e.busca)}" placeholder="Nome, código ou local"></label>
      <label class="fld"><span>Situação</span><select class="inp" data-status>${STATUS.map(([v, r]) => `<option value="${v}"${v === e.status ? ' selected' : ''}>${r}</option>`).join('')}</select></label><span class="muted" data-contagem aria-live="polite"></span></section><div data-itens></div>`;
    CC.$('[data-busca]', ctx.corpo).addEventListener('input', (ev) => { e.busca = ev.target.value; pintar(); });
    CC.$('[data-status]', ctx.corpo).addEventListener('change', (ev) => { e.status = ev.target.value; pintar(); });
    CC.$('[data-itens]', ctx.corpo).addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-devolver],button[data-avaliar],button[data-historico]');
      if (!b) return;
      if (b.dataset.devolver) devolver(ctx, b.dataset.devolver, b.dataset.nome);
      else if (b.dataset.avaliar) avaliar(ctx, b.dataset.avaliar, b.dataset.nome);
      else historico(b.dataset.historico, b.dataset.nome);
    });
    pintar();
  }

  function kit(ctx) {
    CC.$('[data-corpo-sub]', ctx.corpo).innerHTML = `<section class="card logi-kit"><div><h2 class="logi-titulo">Kit padrão dos técnicos</h2><p class="muted">Defina o que cada kit deve conter. Extras individuais são registrados em cada entrega.</p></div>
      <form data-kit-form><div class="logi-kit-lista" data-kit-lista>${ctx.dados.kit.itens.map((i) => linhaKit(i.nome, i.quantidade)).join('')}</div>
      <div class="logi-form-acoes"><button type="button" class="btn btn-s" data-adicionar>${D.ic('plus')}Adicionar item</button><button type="submit" class="btn btn-p">Salvar kit padrão</button></div></form></section>`;
    const lista = CC.$('[data-kit-lista]', ctx.corpo);
    CC.$('[data-adicionar]', ctx.corpo).addEventListener('click', () => { lista.insertAdjacentHTML('beforeend', linhaKit('', 1)); lista.lastElementChild.querySelector('input').focus(); });
    lista.addEventListener('click', (ev) => { const b = ev.target.closest('[data-remover]'); if (b) b.closest('[data-kit-item]').remove(); });
    CC.$('[data-kit-form]', ctx.corpo).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const itens = [...ctx.corpo.querySelectorAll('[data-kit-item]')].map((r) => ({ nome: r.querySelector('[name="nome"]').value, quantidade: Number(r.querySelector('[name="quantidade"]').value) }));
      try { await CC.api('/logistica/kits/padrao', { method: 'PUT', body: { itens } }); CC.toast('Kit padrão atualizado'); ctx.atualizar(); }
      catch (error) { CC.toast(error.message || 'Não foi possível salvar o kit'); }
    });
  }

  L.modulos.ferramental = {
    dados: (e) => (e.sub.ferramental === 'kit' ? ['kit'] : ['ferramentas']),
    acoes: [
      ['entregar', 'p', 'package', 'Entregar ferramentas', (ctx) => L.checklist(ctx, 'entrega')],
      ['cadastrar', 's', 'plus', 'Cadastrar ferramenta', (ctx) => L.cadastrarFerramenta(ctx)],
      ['conferencia', 's', 'clipboard-text', 'Conferência inicial', (ctx) => L.checklist(ctx, 'conferencia')],
    ],
    desenhar(ctx) {
      ctx.corpo.innerHTML = `${L.visoes(ctx, 'ferramental', SUBS, 'Visão do ferramental')}<div class="logi-sub-corpo" data-corpo-sub></div>`;
      L.ligarVisoes(ctx, 'ferramental');
      if (ctx.estado.sub.ferramental === 'kit') kit(ctx); else inventario(ctx);
    },
  };
})(window.CC);
