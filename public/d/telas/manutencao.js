(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const O = D.obras;
  const M = O.manutencao = {};
  const { esc } = CC;
  const dinheiro = (n) => esc(CC.money(Number(n || 0)));

  M.cartao = (c) => `<article class="card cartao-obra"><div class="topo"><span class="chips">${U.chip(c.codigo, 'info')}${U.chip('Manutenção', 'neutro')}${c.ativo === false ? U.chip('Inativo', 'neutro') : ''}</span></div>
    <a class="tx" href="#/obras/${esc(c.id)}"><b>${esc(c.nome)}</b><span class="muted">${esc(c.cliente || 'Sem cliente')}</span></a>
    <div class="valores"><span><span class="lbl">Valor mensal</span><b>${dinheiro(c.orcamento)}</b></span><span><span class="lbl">Despesas no mês</span><b>${dinheiro(c.total_comprometido_mes)}</b></span></div></article>`;

  M.lista = async (el, abas, vivo) => {
    try {
      const { data } = await CC.api('/centros-custo?kind=contrato_manutencao');
      if (!vivo()) return;
      const cards = data.map(M.cartao).join('');
      el.innerHTML = `${abas}<div class="grade-obras">${cards || U.vazio('buildings', 'Nenhum contrato de manutenção cadastrado.')}</div>`;
    } catch (e) {
      if (vivo()) el.innerHTML = `${abas}<div class="card">${U.vazio('warning', e.message)}</div>`;
    }
  };

  M.detalhe = async (el, c, vivo, recarregar) => {
    el.innerHTML = `<div class="pagina obra">${U.carregando('Abrindo contrato…')}</div>`;
    let periodos, resumo, centros;
    try {
      ({ data: resumo } = await CC.api(`/centros-custo/${c.id}/manutencao-resumo`));
      [periodos, centros] = await Promise.all([
        CC.api(`/centros-custo/${c.id}/competencias-manutencao`).then((r) => r.data),
        D.tem('p4') ? CC.api('/centros-custo').then((r) => r.data) : [],
      ]);
    }
    catch (e) { if (vivo()) el.innerHTML = `<div class="pagina"><div class="card">${U.vazio('warning', e.message)}</div></div>`; return; }
    if (!vivo()) return;
    const linhas = periodos.map((p) => `<tr><td>${esc(p.mes)}</td><td>${dinheiro(p.valor_mensal)}</td><td>${dinheiro(p.despesas_comprometidas)}</td><td>${dinheiro(p.despesas_pagas)}</td>
      <td>${p.recebido ? 'Pago pelo cliente' : 'Aguardando pagamento'}</td><td>${D.pode('cadastrar') ? `<button type="button" class="btn btn-s" data-recebimento="${esc(p.mes)}" data-pago="${p.recebido ? 'true' : 'false'}">${p.recebido ? 'Marcar não pago' : 'Marcar pago'}</button>` : ''}</td></tr>`).join('');
    const estornados = new Set(resumo.movimentos.map((m) => m.estorno_de).filter(Boolean));
    const movimentos = resumo.movimentos.map((m) => `<tr><td>${esc(m.data)}</td><td>${m.estorno_de ? 'Estorno: ' : ''}${esc(m.destino || 'Financeiro')}</td><td>${dinheiro(m.valor)}</td><td>${m.lancamento ? (m.deleted_at ? 'Receita cancelada' : m.receita_estornada ? 'Receita estornada' : m.situacao_financeira === 'liquidado' ? 'Receita recebida' : 'Receita pendente') : estornados.has(m.public_id) ? 'Estornada' : 'Transferência interna'}</td>
      <td>${D.tem('p4') && m.destino && !m.estorno_de && !estornados.has(m.public_id) ? `<button class="btn btn-s" type="button" data-estornar="${esc(m.public_id)}">Estornar</button>` : ''}</td></tr>`).join('');
    const opcoes = centros.filter((x) => x.ativo !== false && String(x.id) !== String(c.id)).map((x) => `<option value="${esc(x.id)}">${esc(x.codigo)} — ${esc(x.nome)}</option>`).join('');
    el.innerHTML = `<div class="pagina obra"><a class="voltar" href="#/obras?tipo=contrato_manutencao">${D.ic('arrow-left')}Contratos de manutenção</a>
      <div class="cab cab-obra"><div class="tit"><h1>${esc(c.nome)}</h1><span class="sub">${esc([c.codigo,c.cliente,c.contrato].filter(Boolean).join(' · '))}</span></div>
      <div class="acoes">${D.pode('cadastrar') ? `<button type="button" class="btn btn-s" data-editar>Editar</button>` : ''}<button type="button" class="btn btn-p" data-lancar>Lançar despesa</button></div></div>
      <div class="card"><p>Valor mensal atual: <b>${dinheiro(c.orcamento)}</b></p><p class="muted">Ao registrar uma competência, é usado o valor mensal atual. O recebimento indica o pagamento pelo cliente e não cria um lançamento financeiro.</p>
      ${D.pode('cadastrar') ? `<label>Competência <input type="month" data-mes value="${esc(CC.today().slice(0, 7))}"></label> <button type="button" class="btn btn-s" data-abrir>Registrar competência</button>` : ''}</div>
      <div class="card"><h2>Saldo acumulado: ${dinheiro(resumo.saldo)}</h2><p>Mensalidades ${dinheiro(resumo.mensalidades)} · Despesas comprometidas ${dinheiro(resumo.despesas)} · Recorrentes ainda não lançados ${dinheiro(resumo.recorrentes_previstos)} · Recebido de outros centros ${dinheiro(resumo.entradas)} · Destinado ${dinheiro(resumo.saidas)}</p>
      <p class="muted">O saldo permanece no contrato até ser destinado. No financeiro, a destinação gera uma receita pendente.</p>
      ${D.tem('p4') ? `<form data-destinar><label>Destino <select name="destino"><option value="financeiro">Financeiro — receita pendente</option>${opcoes}</select></label> <label>Valor (R$) <input name="valor" inputmode="decimal" placeholder="0,00" required></label> <button class="btn btn-p" type="submit">Destinar saldo</button></form>` : ''}</div>
      <div class="card"><h2>Competências</h2><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Valor mensal</th><th>Despesas comprometidas</th><th>Despesas pagas</th><th>Recebimento</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>${periodos.length ? '' : '<p>Nenhuma competência registrada.</p>'}</div>
      <div class="card"><h2>Destinações</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Destino</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${movimentos}</tbody></table></div>${movimentos ? '' : '<p>Nenhuma destinação registrada.</p>'}</div>
      <p><a href="#/recorrentes">Gerenciar despesas recorrentes</a></p></div>`;
    CC.$('[data-editar]', el)?.addEventListener('click', () => O.formulario(c, recarregar));
    CC.$('[data-lancar]', el).addEventListener('click', () => {
      D.lanc.recarregar = () => { if (vivo()) recarregar(); };
      D.lanc.formulario(null, null, c.id);
    });
    CC.$('[data-abrir]', el)?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await CC.api(`/centros-custo/${c.id}/competencias-manutencao`, { method: 'POST', body: { mes: CC.$('[data-mes]', el).value } }); await recarregar(); }
      catch (error) { await D.avisar('Não foi possível registrar', error.message); e.currentTarget.disabled = false; }
    });
    CC.$$('[data-recebimento]', el).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await CC.api(`/centros-custo/${c.id}/competencias-manutencao/${b.dataset.recebimento}/recebimento`, { method:'PUT', body:{ recebido:b.dataset.pago !== 'true' } }); await recarregar(); }
      catch (error) { await D.avisar('Não foi possível atualizar', error.message); b.disabled = false; }
    }));
    const form = CC.$('[data-destinar]', el);
    if (form) {
      const clientId = crypto.randomUUID();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = CC.$('button', form), destino = form.elements.destino.value, valor = CC.parseMoney(form.elements.valor.value);
        if (!(valor > 0)) { await D.avisar('Valor inválido', 'Informe um valor maior que zero.'); return; }
        button.disabled = true;
        try { await CC.api(`/centros-custo/${c.id}/manutencao-movimentos`, { method:'POST', body:{ destino: destino === 'financeiro' ? 'financeiro' : 'centro', centro_destino: destino === 'financeiro' ? null : Number(destino), valor, client_id:clientId } }); await recarregar(); }
        catch (error) { await D.avisar('Não foi possível destinar', error.message); button.disabled = false; }
      });
    }
    CC.$$('[data-estornar]', el).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await CC.api(`/centros-custo/${c.id}/manutencao-movimentos/${b.dataset.estornar}/estornar`, { method:'POST', body:{} }); await recarregar(); }
      catch (error) { await D.avisar('Não foi possível estornar', error.message); b.disabled = false; }
    }));
  };
})(window.CC);
