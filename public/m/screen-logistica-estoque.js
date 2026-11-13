// Logistica › Materiais: estoque (saldo, minimo, entrada) e pedidos dos tecnicos, com entrega direta em folha.
// (screen-logistica-materiais.js e o pedido de material do tecnico; este arquivo e o lado do escritorio.)
(function (CC) {
  const { esc } = CC;
  const L = CC.logi;
  const SUBS = [['estoque', 'Estoque'], ['pedidos', 'Pedidos']];
  const PEDIDO = { solicitada: ['Solicitado', ''], parcial: ['Parcial', 'warn'] };
  const abrir = async (ctx, chaves) => {
    try { await ctx.carregar(chaves); } catch (error) { L.aviso(error, 'Não foi possível abrir o formulário.'); return false; }
    return ctx.page.isConnected;
  };

  // Entrada de estoque; sem materialId pergunta qual material.
  L.entradaMaterial = async (ctx, materialId) => {
    if (!(await abrir(ctx, ['materiais']))) return;
    const lista = ctx.dados.materiais, fixo = materialId ? lista.find((m) => String(m.id) === String(materialId)) : null;
    const selo = L.idem();
    L.folha({
      icone: 'download-simple', titulo: 'Registrar entrada de material', ok: 'Atualizar estoque',
      corpo: `${fixo ? `<input type="hidden" name="materialId" value="${esc(fixo.id)}"><p class="sub lgo-ctx">${esc(`${fixo.nome} · saldo ${L.qtd(fixo.saldo)} ${fixo.unidade}`)}</p>`
        : L.select('Material', 'materialId', L.opcoes(lista.map((m) => ({ id: m.id, rotulo: `${m.nome} (${m.unidade})` })), 'id', 'rotulo', 'Selecione o material'), '')}
        ${L.campo('Quantidade', 'quantidade', `${L.NUM} enterkeyhint="next"`)}${L.campo('Motivo', 'motivo', 'value="Reposição" maxlength="200" enterkeyhint="done"')}`,
      aoEnviar: async (form) => {
        const body = { materialId: L.escolha(form, 'materialId', 'Material'), quantidade: L.numero(form, 'quantidade', 'Quantidade'), motivo: L.texto(form, 'motivo', 'Motivo', 3) };
        await CC.api('/logistica/materiais/entradas', { method: 'POST', body: selo(body) });
        CC.toast('Estoque atualizado');
      },
      feito: ctx.atualizar,
    });
  };

  function cadastrar(ctx) {
    L.folha({
      icone: 'plus', titulo: 'Cadastrar material', ok: 'Salvar material',
      corpo: `${L.campo('Nome', 'nome', 'maxlength="120" autocomplete="off" autocapitalize="sentences" enterkeyhint="next"')}
        ${L.campo('Unidade', 'unidade', 'maxlength="24" placeholder="un, caixa, metro" autocomplete="off" autocapitalize="none" enterkeyhint="next"')}
        ${L.campo('Saldo inicial', 'saldoInicial', 'type="number" inputmode="decimal" min="0" step="0.001" value="0" enterkeyhint="next"')}
        ${L.campo('Estoque mínimo', 'estoqueMinimo', 'type="number" inputmode="decimal" min="0" step="0.001" value="0" enterkeyhint="done"')}
        ${L.marca('Exige devolução de sobra', 'exigeRetorno')}`,
      aoEnviar: async (form) => {
        const body = {
          nome: L.texto(form, 'nome', 'Nome', 3), unidade: L.texto(form, 'unidade', 'Unidade'),
          saldoInicial: L.numero(form, 'saldoInicial', 'Saldo inicial', { zero: true }), estoqueMinimo: L.numero(form, 'estoqueMinimo', 'Estoque mínimo', { zero: true }),
          exigeRetorno: form.elements.exigeRetorno.checked,
        };
        await CC.api('/logistica/materiais', { method: 'POST', body });
        CC.toast('Material cadastrado');
      },
      feito: ctx.atualizar,
    });
  }

  // Entrega direta; com pedido ja vem preenchida e da baixa no pedido.
  L.entregarMaterial = async (ctx, pedido) => {
    if (!(await abrir(ctx, ['materiais', 'opcoes']))) return;
    const { materiais, opcoes } = ctx.dados;
    const selo = L.idem();
    L.folha({
      icone: 'archive', titulo: 'Entregar material', ok: 'Registrar entrega',
      corpo: `<p class="sub lgo-ctx">O técnico recebe a ficha para assinar no celular, em Meu kit.</p>
        ${L.select('Técnico', 'tecnicoId', L.opcoes(opcoes.tecnicos, 'id', 'nome', 'Selecione o técnico'), pedido && pedido.tecnico_id)}
        ${L.select('Obra ou serviço', 'centroId', L.opcoes(opcoes.centros, 'id', 'name', 'Selecione a obra ou o serviço'), pedido && pedido.centro_id)}
        ${L.select('Material', 'materialId', L.opcoes(materiais.map((m) => ({ id: m.id, rotulo: `${m.nome} (saldo ${L.qtd(m.saldo)} ${m.unidade})` })), 'id', 'rotulo', 'Selecione o material'), pedido && pedido.material_id)}
        ${L.campo('Quantidade', 'quantidade', `${L.NUM} enterkeyhint="done" value="${pedido ? esc(L.restante(pedido)) : ''}"`)}`,
      aoEnviar: async (form) => {
        const body = {
          tecnicoId: L.escolha(form, 'tecnicoId', 'Técnico'), centroId: L.escolha(form, 'centroId', 'Obra ou serviço'),
          itens: [{ materialId: L.escolha(form, 'materialId', 'Material'), quantidade: L.numero(form, 'quantidade', 'Quantidade') }],
        };
        if (pedido) body.solicitacaoId = Number(pedido.id);
        await CC.api('/logistica/materiais/entregas', { method: 'POST', body: selo(body) });
        CC.toast('Material entregue e ficha criada');
      },
      feito: ctx.atualizar,
    });
  };

  function estoque(ctx, slot) {
    const baixo = ctx.estado.estoque === 'baixo';
    const lista = ctx.dados.materiais.filter((m) => !baixo || m.estoque_baixo).sort((a, b) => Number(b.estoque_baixo) - Number(a.estoque_baixo) || a.nome.localeCompare(b.nome, 'pt-BR'));
    slot.innerHTML = `${baixo ? '<p class="sub lgo-nota">Mostrando só os materiais abaixo do mínimo.</p><button type="button" class="btn2 lgo-solto" id="lg-limpar">Mostrar todos</button>' : ''}
      ${lista.length ? `<div class="lgo-lista">${lista.map((m) => L.item({
        titulo: m.nome, tags: `${m.estoque_baixo ? L.tag('Estoque baixo', 'warn') : ''}${m.exige_retorno ? L.tag('Devolver sobra') : ''}`,
        linhas: [`Saldo ${L.qtd(m.saldo)} ${m.unidade} · mínimo ${L.qtd(m.estoque_minimo)}`], botoes: L.botao('repor', m.id, 'Dar entrada', m.nome),
      })).join('')}</div>` : L.vazio(baixo ? 'check-circle' : 'archive', baixo ? 'Nenhum material abaixo do mínimo.' : 'Nenhum material cadastrado. Cadastre itens como RJ45, parafusos ou consumíveis.')}`;
    CC.$$('[data-repor]', slot).forEach((b) => b.addEventListener('click', () => L.entradaMaterial(ctx, b.dataset.repor)));
    const limpar = CC.$('#lg-limpar', slot);
    if (limpar) limpar.addEventListener('click', () => ctx.ir('materiais', 'estoque', { estoque: '' }));
  }

  function pedidos(ctx, slot) {
    const abertos = L.pedidosAbertos(ctx.dados.pedidos);
    slot.innerHTML = abertos.length ? `<div class="lgo-lista">${abertos.map((p) => {
      const s = PEDIDO[p.status];
      return L.item({
        titulo: p.material, tags: L.tag(s[0], s[1]),
        linhas: [`Falta entregar ${L.qtd(L.restante(p))} ${p.unidade}`, p.centro, `Pedido por ${p.tecnico}`, p.observacao ? `Observação: ${p.observacao}` : ''],
        botoes: L.botao('atender', p.id, 'Entregar', `${p.material} para ${p.tecnico}`),
      });
    }).join('')}</div>` : L.vazio('check-circle', 'Nenhum pedido pendente. Os pedidos feitos pelos técnicos aparecem aqui.');
    CC.$$('[data-atender]', slot).forEach((b) => b.addEventListener('click', () => L.entregarMaterial(ctx, abertos.find((p) => String(p.id) === b.dataset.atender))));
  }

  L.modulos.materiais = {
    dados: (e) => (e.sub.materiais === 'pedidos' ? ['materiais', 'pedidos', 'opcoes'] : ['materiais']),
    acoes: [
      ['archive', 'Entregar material', (ctx) => L.entregarMaterial(ctx)],
      ['download-simple', 'Registrar entrada', (ctx) => L.entradaMaterial(ctx)],
      ['plus', 'Cadastrar material', cadastrar],
    ],
    desenhar(ctx) {
      ctx.corpo.innerHTML = `${L.seg(ctx, 'materiais', SUBS, 'Visão dos materiais')}<div class="lgo-corpo" id="lg-sub"></div>`;
      L.ligarSeg(ctx, 'materiais');
      const slot = CC.$('#lg-sub', ctx.corpo);
      if (ctx.estado.sub.materiais === 'pedidos') pedidos(ctx, slot); else estoque(ctx, slot);
    },
  };
})(window.CC = window.CC || {});
