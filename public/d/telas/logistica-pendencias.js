// Aba Pendencias: faltas de ferramenta para apurar e devolucoes de material em aberto; Historico: movimentos.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const L = D.logi;
  const { esc } = CC;
  const SUBS = [{ valor: 'ferramentas', rotulo: 'Ferramentas' }, { valor: 'materiais', rotulo: 'Materiais' }];

  async function apurar(ctx, id, contexto) {
    const feito = await L.dialogoFormulario({
      titulo: 'Registrar apuração da falta', ok: 'Salvar apuração',
      corpo: `<p class="muted">${esc(contexto)}</p>${U.campo({ rotulo: 'O que a Logística apurou?', name: 'apuracao', tipo: 'textarea', obrigatorio: true })}`,
      aoAbrir: (form) => Object.assign(form.elements.apuracao, { minLength: 5, maxLength: 2000 }),
      aoEnviar: async (form) => {
        await CC.api(`/logistica/faltas/${id}/apuracao`, { method: 'POST', body: { apuracao: form.elements.apuracao.value.trim() } });
        CC.toast('Apuração registrada');
      },
    });
    if (feito) ctx.atualizar();
  }

  async function devolver(ctx, dados) {
    const feito = await L.dialogoFormulario({
      titulo: `Devolver ${dados.nome}`, ok: 'Registrar retorno',
      corpo: U.campo({ rotulo: `Quantidade devolvida (máximo ${L.qtd(dados.restante)})`, name: 'quantidade', tipo: 'number', valor: dados.restante, obrigatorio: true }),
      aoAbrir: (form) => Object.assign(form.elements.quantidade, { min: '0.001', max: dados.restante, step: '0.001' }),
      aoEnviar: async (form) => {
        await CC.api('/logistica/materiais/devolucoes', { method: 'POST', body: { reciboId: Number(dados.recibo), materialId: Number(dados.material), quantidade: Number(form.elements.quantidade.value), client_id: CC.uuid() } });
        CC.toast('Devolução registrada');
      },
    });
    if (feito) ctx.atualizar();
  }

  async function revisar(ctx, id, contexto) {
    const feito = await L.dialogoFormulario({
      titulo: 'Registrar revisão da divergência', ok: 'Salvar revisão',
      corpo: `<p class="muted">${esc(contexto)}</p>${U.campo({ rotulo: 'O que a Logística conferiu?', name: 'revisao', tipo: 'textarea', obrigatorio: true })}`,
      aoAbrir: (form) => Object.assign(form.elements.revisao, { minLength: 5, maxLength: 2000 }),
      aoEnviar: async (form) => {
        await CC.api(`/logistica/entregas/${id}/revisao`, { method: 'POST', body: { revisao: form.elements.revisao.value.trim() } });
        CC.toast('Revisão registrada; a ficha volta para assinatura');
      },
    });
    if (feito) ctx.atualizar();
  }

  async function verFicha(id) {
    try { L.ficha((await CC.api(`/logistica/entregas/${id}`)).data, 'Ficha para impressão'); }
    catch (error) { CC.toast(error.message || 'Não foi possível abrir a ficha.'); }
  }

  const TIPOS_FICHA = { entrega_ferramenta: 'Ferramentas', conferencia_inicial: 'Conferência inicial', entrega_material: 'Material' };
  const SITUACAO_FICHA = { aguardando_assinatura: ['Aguardando assinatura', 'warn', 'signature'], divergencia: ['Divergência', 'err', 'warning-circle'] };

  L.modulos.pendencias = {
    dados: () => ['fichas', 'faltas', 'devolucoes'],
    acoes: [],
    desenhar(ctx) {
      const { faltas, devolucoes } = ctx.dados;
      const filtro = ctx.estado.fichas;
      const fichas = ctx.dados.fichas.filter((f) => !filtro || f.status === filtro);
      const nota = filtro ? `<p class="muted logi-nota">Mostrando só: ${esc(SITUACAO_FICHA[filtro][0].toLowerCase())}. <button type="button" class="btn btn-g" data-limpar-fichas>Mostrar todas</button></p>` : '';
      ctx.corpo.innerHTML = `<div class="logi-painel-int" data-pend>
        <section class="logi-secao">${L.titulo('Fichas pendentes', fichas.length ? String(fichas.length) : '')}${nota}${L.cartao(U.tabela({
          vazio: filtro ? 'Nenhuma ficha neste filtro.' : 'Nenhuma ficha pendente. Fichas aguardando assinatura ou revisão aparecem aqui.', vazioIcone: 'check-circle',
          colunas: [{ rotulo: 'Ficha' }, { rotulo: 'Técnico' }, { rotulo: 'Obra/serviço' }, { rotulo: 'Situação' }, { rotulo: 'Relato do técnico' }, { rotulo: 'Ação' }],
          linhas: fichas.map((f) => { const s = SITUACAO_FICHA[f.status]; const nome = `ficha ${f.id} de ${f.tecnico}`; return { celulas: [`Nº ${esc(f.id)} · ${esc(TIPOS_FICHA[f.tipo] || L.rotulo(f.tipo))} · ${esc(L.data(f.criado_em))}`, esc(f.tecnico), esc(f.centro || '—'), U.chip(s[0], s[1], s[2]), f.divergencia ? esc(f.divergencia) : '—',
            f.status === 'divergencia' ? L.botaoLinha('revisar', f.id, 'Registrar revisão', nome, ` data-contexto="${esc(`Ficha ${f.id}: ${f.divergencia || ''}`)}"`) : L.botaoLinha('ficha', f.id, 'Ver ficha', nome)] }; }),
        }), true, 'Fichas aguardando assinatura ou revisão')}</section>
        <section class="logi-secao">${L.titulo('Faltas de ferramenta', faltas.length ? String(faltas.length) : '')}${L.cartao(U.tabela({
          vazio: 'Nenhuma falta pendente. Faltas relatadas pelos técnicos aparecem aqui.', vazioIcone: 'check-circle',
          colunas: [{ rotulo: 'Data' }, { rotulo: 'Técnico' }, { rotulo: 'Ferramenta' }, { rotulo: 'Relato' }, { rotulo: 'Apuração' }, { rotulo: 'Ação' }],
          linhas: faltas.map((f) => ({ celulas: [esc(L.data(f.criada_em)), esc(f.tecnico), `${esc(f.ferramenta)} (${esc(f.codigo)})`, esc(f.relato), f.apuracao ? esc(f.apuracao) : U.chip('Pendente', 'warn', 'clock'), L.botaoLinha('apurar', f.id, 'Registrar apuração', `${f.ferramenta}, ${f.tecnico}`, ` data-contexto="${esc(`${f.ferramenta} (${f.codigo}), ${f.tecnico}`)}"`)] })),
        }), true, 'Faltas de ferramenta')}${faltas.length ? '<p class="muted logi-nota">A ocorrência fica aberta até a reposição da ferramenta; a apuração preserva o histórico.</p>' : ''}</section>
        <section class="logi-secao">${L.titulo('Devoluções pendentes', devolucoes.length ? String(devolucoes.length) : '')}${L.cartao(U.tabela({
          vazio: 'Nenhuma devolução pendente. Sobras de material aparecem aqui até serem devolvidas.', vazioIcone: 'check-circle',
          colunas: [{ rotulo: 'Entrega' }, { rotulo: 'Material' }, { rotulo: 'Em aberto', num: true }, { rotulo: 'Técnico / obra' }, { rotulo: 'Ação' }],
          linhas: devolucoes.map((d) => ({ celulas: [`${esc(L.data(d.criado_em))} · ficha ${esc(d.recibo_id)}`, esc(d.material), `${esc(L.qtd(d.pendente))} ${esc(d.unidade)}`, `${esc(d.tecnico)} · ${esc(d.centro || '—')}`,
            L.botaoLinha('devolucao', d.recibo_id, 'Registrar retorno', d.material, ` data-material="${esc(d.material_id)}" data-nome="${esc(d.material)}" data-restante="${esc(d.pendente)}"`)] })),
        }), true, 'Devoluções de material pendentes')}</section></div>`;
      CC.$('[data-pend]', ctx.corpo).addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-apurar]'), d = ev.target.closest('[data-devolucao]'), r = ev.target.closest('[data-revisar]'), v = ev.target.closest('[data-ficha]');
        if (ev.target.closest('[data-limpar-fichas]')) ctx.ir('pendencias', undefined, { fichas: '' });
        if (r) revisar(ctx, r.dataset.revisar, r.dataset.contexto);
        if (v) verFicha(v.dataset.ficha);
        if (a) apurar(ctx, a.dataset.apurar, a.dataset.contexto);
        if (d) devolver(ctx, { recibo: d.dataset.devolucao, material: d.dataset.material, nome: d.dataset.nome, restante: d.dataset.restante });
      });
    },
  };

  L.modulos.historico = {
    dados: (e) => [e.sub.historico === 'materiais' ? 'movMat' : 'movFerr'],
    acoes: [],
    desenhar(ctx) {
      const materiais = ctx.estado.sub.historico === 'materiais';
      ctx.corpo.innerHTML = `${L.visoes(ctx, 'historico', SUBS, 'Tipo de histórico')}<div>${materiais ? L.cartao(U.tabela({
        vazio: 'Sem movimentações de material ainda. Entradas, entregas e devoluções aparecem aqui.', vazioIcone: 'clock-counter-clockwise',
        colunas: [{ rotulo: 'Data e hora' }, { rotulo: 'Movimento' }, { rotulo: 'Material' }, { rotulo: 'Quantidade', num: true }, { rotulo: 'Técnico / obra' }, { rotulo: 'Motivo' }],
        linhas: ctx.dados.movMat.slice(0, 100).map((m) => ({ celulas: [esc(L.data(m.criado_em)), esc(L.movimento(m.tipo)), esc(m.material), `${esc(L.qtd(m.quantidade))} ${esc(m.unidade)}`, m.tecnico ? `${esc(m.tecnico)} · ${esc(m.centro || '—')}` : '—', esc(m.motivo || '—')] })),
      }), false, 'Movimentações de material') + (ctx.dados.movMat.length > 100 ? '<p class="muted logi-nota">Mostrando os 100 movimentos mais recentes.</p>' : '') : L.cartao(U.tabela({
        vazio: 'Ainda não há movimentações de ferramenta. Entradas, entregas e devoluções aparecem aqui.', vazioIcone: 'clock-counter-clockwise',
        colunas: [{ rotulo: 'Data e hora' }, { rotulo: 'Movimento' }, { rotulo: 'Ferramenta' }, { rotulo: 'Técnico' }, { rotulo: 'Detalhe' }],
        linhas: ctx.dados.movFerr.map((m) => ({ celulas: [esc(L.data(m.criado_em)), esc(L.movimento(m.tipo)), m.ferramenta ? `${esc(m.ferramenta)}${m.codigo ? ` (${esc(m.codigo)})` : ''}` : '—', esc(m.tecnico || '—'), esc(L.detalhe(m.detalhe))] })),
      }), false, 'Movimentações de ferramenta')}</div>`;
      L.ligarVisoes(ctx, 'historico');
    },
  };
})(window.CC);
