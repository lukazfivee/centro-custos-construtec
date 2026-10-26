// Aba Materiais: estoque (saldo, minimo, entrada) e pedidos dos tecnicos, com entrega direta em dialogo.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const L = D.logi;
  const { esc } = CC;
  const SUBS = [{ valor: 'estoque', rotulo: 'Estoque' }, { valor: 'pedidos', rotulo: 'Pedidos' }];
  const PEDIDO = { solicitada: ['Solicitado', 'info', 'clock'], parcial: ['Parcial', 'warn', 'hourglass-medium'] };
  const restante = (p) => Number(p.solicitada) - Number(p.entregue);
  const opcoes = (linhas, chave, rotulo, vazio) => [{ valor: '', rotulo: vazio }, ...linhas.map((i) => ({ valor: i[chave], rotulo: i[rotulo] }))];

  // Entrada de estoque; sem materialId pergunta qual material.
  L.entradaMaterial = async (ctx, materialId) => {
    try { await ctx.carregar(['materiais']); } catch (error) { return CC.toast(error.message || 'Não foi possível abrir o formulário.'); }
    const lista = ctx.dados.materiais;
    const escolha = materialId ? `<input type="hidden" name="materialId" value="${esc(materialId)}"><p class="muted">${esc(lista.find((m) => String(m.id) === String(materialId))?.nome || '')}</p>`
      : U.campo({ rotulo: 'Material', name: 'materialId', tipo: 'select', obrigatorio: true, opcoes: opcoes(lista.map((m) => ({ ...m, rotulo: `${m.nome} (${m.unidade})` })), 'id', 'rotulo', 'Selecione o material') });
    const feito = await L.dialogoFormulario({
      titulo: 'Registrar entrada de material', ok: 'Atualizar estoque',
      corpo: `${escolha}${U.campo({ rotulo: 'Quantidade', name: 'quantidade', tipo: 'number', obrigatorio: true })}${U.campo({ rotulo: 'Motivo', name: 'motivo', valor: 'Reposição', obrigatorio: true })}`,
      aoAbrir: (form) => { Object.assign(form.elements.quantidade, { min: '0.001', step: '0.001' }); form.elements.motivo.maxLength = 200; },
      aoEnviar: async (form) => {
        await CC.api('/logistica/materiais/entradas', { method: 'POST', body: { materialId: Number(form.elements.materialId.value), quantidade: Number(form.elements.quantidade.value), motivo: form.elements.motivo.value.trim(), client_id: CC.uuid() } });
        CC.toast('Estoque atualizado');
      },
    });
    if (feito) ctx.atualizar();
  };

  async function cadastrar(ctx) {
    const feito = await L.dialogoFormulario({
      titulo: 'Cadastrar material', ok: 'Salvar material',
      corpo: `${U.campo({ rotulo: 'Nome', name: 'nome', obrigatorio: true })}${U.campo({ rotulo: 'Unidade', name: 'unidade', placeholder: 'un, caixa, metro', obrigatorio: true })}${U.campo({ rotulo: 'Saldo inicial', name: 'saldoInicial', tipo: 'number', valor: 0 })}${U.campo({ rotulo: 'Estoque mínimo', name: 'estoqueMinimo', tipo: 'number', valor: 0 })}<label class="logi-escolha"><input type="checkbox" name="exigeRetorno"><span>Exige devolução de sobra</span></label>`,
      aoAbrir: (form) => { form.elements.nome.maxLength = 120; form.elements.unidade.maxLength = 24; for (const n of ['saldoInicial', 'estoqueMinimo']) Object.assign(form.elements[n], { min: '0', step: '0.001' }); },
      aoEnviar: async (form) => {
        const body = Object.fromEntries(new FormData(form));
        body.exigeRetorno = form.elements.exigeRetorno.checked;
        await CC.api('/logistica/materiais', { method: 'POST', body });
        CC.toast('Material cadastrado');
      },
    });
    if (feito) ctx.atualizar();
  }

  // Entrega direta; com pedido preenche tudo e baixa o pedido.
  L.entregarMaterial = async (ctx, pedido) => {
    try { await ctx.carregar(['materiais', 'opcoes']); } catch (error) { return CC.toast(error.message || 'Não foi possível abrir o formulário.'); }
    const { materiais, opcoes: op } = ctx.dados;
    let recibo = null;
    const feito = await L.dialogoFormulario({
      titulo: 'Entregar material', ok: 'Registrar entrega e imprimir ficha',
      corpo: `${U.campo({ rotulo: 'Técnico', name: 'tecnicoId', tipo: 'select', obrigatorio: true, valor: pedido?.tecnico_id, opcoes: opcoes(op.tecnicos, 'id', 'nome', 'Selecione o técnico') })}
        ${U.campo({ rotulo: 'Obra ou serviço', name: 'centroId', tipo: 'select', obrigatorio: true, valor: pedido?.centro_id, opcoes: opcoes(op.centros, 'id', 'name', 'Selecione a obra ou o serviço') })}
        ${U.campo({ rotulo: 'Material', name: 'materialId', tipo: 'select', obrigatorio: true, valor: pedido?.material_id, opcoes: opcoes(materiais, 'id', 'nome', 'Selecione o material') })}
        ${U.campo({ rotulo: 'Quantidade', name: 'quantidade', tipo: 'number', obrigatorio: true, valor: pedido ? restante(pedido) : '' })}`,
      aoAbrir: (form) => Object.assign(form.elements.quantidade, { min: '0.001', step: '0.001' }),
      aoEnviar: async (form) => {
        const body = { tecnicoId: Number(form.elements.tecnicoId.value), centroId: Number(form.elements.centroId.value), itens: [{ materialId: Number(form.elements.materialId.value), quantidade: Number(form.elements.quantidade.value) }], client_id: CC.uuid() };
        if (pedido) body.solicitacaoId = Number(pedido.id);
        const { data: entrega } = await CC.api('/logistica/materiais/entregas', { method: 'POST', body });
        recibo = (await CC.api(`/logistica/entregas/${entrega.id}`)).data;
        CC.toast('Material entregue e ficha criada');
      },
    });
    if (feito) { ctx.atualizar(); if (recibo) L.ficha(recibo); }
  };

  function estoque(ctx, corpo) {
    const lista = [...ctx.dados.materiais].sort((a, b) => Number(b.estoque_baixo) - Number(a.estoque_baixo) || a.nome.localeCompare(b.nome, 'pt-BR'));
    corpo.innerHTML = L.cartao(U.tabela({
      vazio: 'Nenhum material cadastrado. Cadastre itens como RJ45, parafusos ou consumíveis.', vazioIcone: 'package',
      colunas: [{ rotulo: 'Material' }, { rotulo: 'Saldo', num: true }, { rotulo: 'Mínimo', num: true }, { rotulo: 'Sobra' }, { rotulo: 'Ação' }],
      linhas: lista.map((m) => ({ celulas: [`${esc(m.nome)} ${m.estoque_baixo ? U.chip('Estoque baixo', 'warn', 'warning') : ''}`, `${esc(L.qtd(m.saldo))} ${esc(m.unidade)}`, esc(L.qtd(m.estoque_minimo)), m.exige_retorno ? U.chip('Devolver', 'info', 'arrow-u-up-left') : '—', L.botaoLinha('repor', m.id, 'Dar entrada', m.nome)] })),
    }), true, 'Saldo e estoque mínimo dos materiais');
    corpo.addEventListener('click', (ev) => { const b = ev.target.closest('[data-repor]'); if (b) L.entradaMaterial(ctx, b.dataset.repor); });
  }

  function pedidos(ctx, corpo) {
    const abertos = ctx.dados.pedidos.filter((p) => ['solicitada', 'parcial'].includes(p.status));
    corpo.innerHTML = L.cartao(U.tabela({
      vazio: 'Nenhum pedido pendente. Os pedidos feitos pelos técnicos aparecem aqui.', vazioIcone: 'check-circle',
      colunas: [{ rotulo: 'Situação' }, { rotulo: 'Material' }, { rotulo: 'Falta entregar', num: true }, { rotulo: 'Obra/serviço' }, { rotulo: 'Solicitante' }, { rotulo: 'Ação' }],
      linhas: abertos.map((p) => { const s = PEDIDO[p.status]; return { celulas: [U.chip(s[0], s[1], s[2]), esc(p.material), `${esc(L.qtd(restante(p)))} ${esc(p.unidade)}`, esc(p.centro), esc(p.tecnico), L.botaoLinha('atender', p.id, 'Entregar', `${p.material} para ${p.tecnico}`)] }; }),
    }), true, 'Pedidos de material pendentes');
    corpo.addEventListener('click', (ev) => { const b = ev.target.closest('[data-atender]'); if (b) L.entregarMaterial(ctx, abertos.find((p) => String(p.id) === b.dataset.atender)); });
  }

  L.modulos.materiais = {
    dados: (e) => (e.sub.materiais === 'pedidos' ? ['materiais', 'pedidos', 'opcoes'] : ['materiais']),
    acoes: [
      ['entregar', 'p', 'package', 'Entregar material', (ctx) => L.entregarMaterial(ctx)],
      ['entrada', 's', 'arrow-line-down', 'Registrar entrada', (ctx) => L.entradaMaterial(ctx)],
      ['cadastrar', 's', 'plus', 'Cadastrar material', cadastrar],
    ],
    desenhar(ctx) {
      ctx.corpo.innerHTML = `${L.visoes(ctx, 'materiais', SUBS, 'Visão dos materiais')}<div data-corpo-sub></div>`;
      L.ligarVisoes(ctx, 'materiais');
      const corpo = CC.$('[data-corpo-sub]', ctx.corpo);
      if (ctx.estado.sub.materiais === 'pedidos') pedidos(ctx, corpo); else estoque(ctx, corpo);
    },
  };
})(window.CC);
