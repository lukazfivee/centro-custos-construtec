// Logistica › Pendencias (fichas, faltas de ferramenta e devolucoes de material em aberto) e › Historico (movimentos).
(function (CC) {
  const { esc } = CC;
  const L = CC.logi;
  const SUBS = [['ferramentas', 'Ferramentas'], ['materiais', 'Materiais']];
  const TIPOS_FICHA = { entrega_ferramenta: 'Ferramentas', conferencia_inicial: 'Conferência inicial', entrega_material: 'Material' };
  const SITUACAO_FICHA = { aguardando_assinatura: ['Aguardando assinatura', 'warn'], divergencia: ['Divergência', 'fin-err'] };
  const MAXIMO = 100;

  function apurar(ctx, id, contexto) {
    L.folha({
      icone: 'warning-circle', titulo: 'Registrar apuração da falta', ok: 'Salvar apuração',
      corpo: `<p class="sub lgo-ctx">${esc(contexto)}</p>${L.area('O que a Logística apurou?', 'apuracao')}`,
      aoEnviar: async (form) => {
        await CC.api(`/logistica/faltas/${encodeURIComponent(id)}/apuracao`, { method: 'POST', body: { apuracao: L.texto(form, 'apuracao', 'O que a Logística apurou', 5) } });
        CC.toast('Apuração registrada');
      },
      feito: ctx.atualizar,
    });
  }

  function devolver(ctx, d) {
    const selo = L.idem();
    L.folha({
      icone: 'arrow-counter-clockwise', titulo: `Devolver ${d.material}`, ok: 'Registrar retorno',
      corpo: `<p class="sub lgo-ctx">${esc(`Ficha ${d.recibo_id} · ${d.tecnico} · em aberto ${L.qtd(d.pendente)} ${d.unidade}`)}</p>
        ${L.campo(`Quantidade devolvida (máximo ${L.qtd(d.pendente)})`, 'quantidade', `${L.NUM} max="${esc(d.pendente)}" value="${esc(Number(d.pendente))}" enterkeyhint="done"`)}`,
      aoEnviar: async (form) => {
        const body = { reciboId: Number(d.recibo_id), materialId: Number(d.material_id), quantidade: L.numero(form, 'quantidade', 'Quantidade devolvida', { maximo: d.pendente }) };
        await CC.api('/logistica/materiais/devolucoes', { method: 'POST', body: selo(body) });
        CC.toast('Devolução registrada');
      },
      feito: ctx.atualizar,
    });
  }

  function revisar(ctx, id, contexto) {
    L.folha({
      icone: 'file-text', titulo: 'Registrar revisão da divergência', ok: 'Salvar revisão',
      corpo: `<p class="sub lgo-ctx">${esc(contexto)}</p>${L.area('O que a Logística conferiu?', 'revisao')}`,
      aoEnviar: async (form) => {
        await CC.api(`/logistica/entregas/${encodeURIComponent(id)}/revisao`, { method: 'POST', body: { revisao: L.texto(form, 'revisao', 'O que a Logística conferiu', 5) } });
        CC.toast('Revisão registrada; a ficha volta para assinatura');
      },
      feito: ctx.atualizar,
    });
  }

  // Ficha so para conferir no celular; imprimir para assinar em papel continua no computador.
  async function verFicha(id) {
    const sh = L.folhaInfo('file-text', `Ficha nº ${id}`, '<div class="skeleton"></div>');
    try {
      const { data: r } = await CC.api(`/logistica/entregas/${encodeURIComponent(id)}`);
      if (!sh.el.isConnected) return;
      const itens = [...(r.ferramentas || []).map((i) => [i.nome, `Código ${i.codigo}`]), ...(r.materiais || []).map((i) => [i.nome, `${L.qtd(i.quantidade)} ${i.unidade}`])];
      const kv = (rotulo, valor) => (valor ? `<div class="kv"><span>${esc(rotulo)}</span><b>${esc(valor)}</b></div>` : '');
      CC.$('.lgo-form', sh.el).innerHTML = `<div class="card">${kv('Tipo', TIPOS_FICHA[r.tipo] || L.rotulo(r.tipo))}${kv('Técnico', r.tecnico)}${kv('Obra/serviço', r.centro)}
        ${kv('Entregue por', r.emissor)}${kv('Data e hora', L.data(r.criado_em))}${kv('Situação', L.rotulo(r.status))}</div>
        ${L.secao('Itens da ficha', String(itens.length))}${itens.map(([nome, det]) => L.item({ titulo: nome, linhas: [det] })).join('') || L.vazio('file-text', 'Ficha sem itens.')}
        <p class="sub lgo-nota">Para imprimir a ficha e colher a assinatura em papel, use o sistema no computador.</p>`;
    } catch (error) {
      if (sh.el.isConnected) CC.$('.lgo-form', sh.el).innerHTML = CC.sheetErr(error);
    }
  }

  L.modulos.pendencias = {
    dados: () => ['fichas', 'faltas', 'devolucoes'],
    acoes: [],
    desenhar(ctx) {
      const { faltas, devolucoes } = ctx.dados, filtro = ctx.estado.fichas;
      const fichas = ctx.dados.fichas.filter((f) => !filtro || f.status === filtro);
      const n = (lista) => (lista.length ? String(lista.length) : '');
      ctx.corpo.innerHTML = `${L.secao('Fichas pendentes', n(fichas))}
        ${filtro ? `<p class="sub lgo-nota">Mostrando só: ${esc(SITUACAO_FICHA[filtro][0].toLowerCase())}.</p><button type="button" class="btn2 lgo-solto" id="lg-limpar">Mostrar todas</button>` : ''}
        ${fichas.length ? `<div class="lgo-lista">${fichas.map((f) => {
          const s = SITUACAO_FICHA[f.status] || [L.rotulo(f.status), ''], nome = `ficha ${f.id} de ${f.tecnico}`;
          return L.item({
            titulo: `Nº ${f.id} · ${TIPOS_FICHA[f.tipo] || L.rotulo(f.tipo)}`, tags: L.tag(s[0], s[1]),
            linhas: [`${f.tecnico} · ${L.data(f.criado_em)}`, f.centro, f.divergencia ? `Relato do técnico: ${f.divergencia}` : ''],
            botoes: `${f.status === 'divergencia' ? L.botao('revisar', f.id, 'Registrar revisão', nome) : ''}${L.botao('ficha', f.id, 'Ver ficha', nome)}`,
          });
        }).join('')}</div>` : L.vazio('check-circle', filtro ? 'Nenhuma ficha neste filtro.' : 'Nenhuma ficha pendente. Fichas aguardando assinatura ou revisão aparecem aqui.')}
        ${L.secao('Faltas de ferramenta', n(faltas))}
        ${faltas.length ? `<div class="lgo-lista">${faltas.map((f) => L.item({
          titulo: `${f.ferramenta} (${f.codigo})`, tags: f.apuracao ? '' : L.tag('Sem apuração', 'warn'),
          linhas: [`${f.tecnico} · ${L.data(f.criada_em)}`, `Relato: ${f.relato}`, f.apuracao ? `Apuração: ${f.apuracao}` : ''],
          botoes: L.botao('apurar', f.id, 'Registrar apuração', `${f.ferramenta}, ${f.tecnico}`),
        })).join('')}</div><p class="sub lgo-nota">A ocorrência fica aberta até a reposição da ferramenta; a apuração preserva o histórico.</p>`
          : L.vazio('check-circle', 'Nenhuma falta pendente. Faltas relatadas pelos técnicos aparecem aqui.')}
        ${L.secao('Devoluções pendentes', n(devolucoes))}
        ${devolucoes.length ? `<div class="lgo-lista">${devolucoes.map((d, i) => L.item({
          titulo: d.material, linhas: [`Em aberto ${L.qtd(d.pendente)} ${d.unidade}`, `${d.tecnico} · ${d.centro || 'Sem obra ou serviço'}`, `Ficha ${d.recibo_id} · ${L.data(d.criado_em)}`],
          botoes: L.botao('devolucao', i, 'Registrar retorno', d.material),
        })).join('')}</div>` : L.vazio('check-circle', 'Nenhuma devolução pendente. Sobras de material aparecem aqui até serem devolvidas.')}`;
      const limpar = CC.$('#lg-limpar', ctx.corpo);
      if (limpar) limpar.addEventListener('click', () => ctx.ir('pendencias', undefined, { fichas: '' }));
      CC.$$('[data-revisar]', ctx.corpo).forEach((b) => b.addEventListener('click', () => {
        const f = fichas.find((x) => String(x.id) === b.dataset.revisar);
        revisar(ctx, f.id, `Ficha ${f.id} de ${f.tecnico}: ${f.divergencia || 'sem relato'}`);
      }));
      CC.$$('[data-ficha]', ctx.corpo).forEach((b) => b.addEventListener('click', () => verFicha(b.dataset.ficha)));
      CC.$$('[data-apurar]', ctx.corpo).forEach((b) => b.addEventListener('click', () => {
        const f = faltas.find((x) => String(x.id) === b.dataset.apurar);
        apurar(ctx, f.id, `${f.ferramenta} (${f.codigo}), ${f.tecnico}: ${f.relato}`);
      }));
      CC.$$('[data-devolucao]', ctx.corpo).forEach((b) => b.addEventListener('click', () => devolver(ctx, devolucoes[Number(b.dataset.devolucao)])));
    },
  };

  L.modulos.historico = {
    dados: (e) => [e.sub.historico === 'materiais' ? 'movMat' : 'movFerr'],
    acoes: [],
    desenhar(ctx) {
      const materiais = ctx.estado.sub.historico === 'materiais';
      const todos = materiais ? ctx.dados.movMat : ctx.dados.movFerr;
      const cartoes = todos.slice(0, MAXIMO).map((m) => (materiais ? L.item({
        titulo: `${L.movimento(m.tipo)} · ${m.material}`,
        linhas: [`${L.qtd(m.quantidade)} ${m.unidade} · ${L.data(m.criado_em)}`, m.tecnico ? `${m.tecnico} · ${m.centro || 'Sem obra ou serviço'}` : '', m.motivo ? `Motivo: ${m.motivo}` : ''],
      }) : L.item({
        titulo: `${L.movimento(m.tipo)}${m.ferramenta ? ` · ${m.ferramenta}` : ''}`,
        linhas: [[m.codigo ? `Código ${m.codigo}` : '', L.data(m.criado_em)].filter(Boolean).join(' · '), m.tecnico ? `Técnico: ${m.tecnico}` : '', L.detalhe(m.detalhe)],
      }))).join('');
      ctx.corpo.innerHTML = `${L.seg(ctx, 'historico', SUBS, 'Tipo de histórico')}
        ${cartoes ? `<div class="lgo-lista">${cartoes}</div>` : L.vazio('arrow-counter-clockwise', materiais ? 'Sem movimentações de material ainda. Entradas, entregas e devoluções aparecem aqui.'
          : 'Ainda não há movimentações de ferramenta. Entradas, entregas e devoluções aparecem aqui.')}
        ${todos.length > MAXIMO ? `<p class="sub lgo-nota">Mostrando os ${MAXIMO} movimentos mais recentes.</p>` : ''}`;
      L.ligarSeg(ctx, 'historico');
    },
  };
})(window.CC = window.CC || {});
