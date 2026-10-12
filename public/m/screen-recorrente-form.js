// Novo, editar e excluir recorrente (mesmos campos do desktop, public/d/telas/recorrente-form.js).
// A previa da proxima geracao usa GET /recorrentes/proxima (a mesma conta do servidor). Gravar exige p5.
(function (CC) {
  const { esc, icon } = CC;
  const F = CC.fin;
  const categoriasDe = (cats, tipo) => cats.filter((c) => c.ativo !== false && (c.tipo === tipo || c.tipo === 'ambos'));
  const opcoes = (lista, vazio, atual) => `<option value="">${esc(vazio)}</option>${lista.map((x) => `<option value="${esc(x.id)}"${String(x.id) === String(atual) ? ' selected' : ''}>${esc(x.rotulo)}</option>`).join('')}`;

  // params: { modelo } (linha da lista; sem ela, novo recorrente).
  CC.screens.recorrente = async function (params) {
    const m = (params && params.modelo) || null;
    const voltar = () => CC.go('recorrentes');
    const titulo = m ? 'Editar recorrente' : 'Novo recorrente';
    const el = F.carregando(titulo, m ? m.nome : '', voltar);
    let obras, cats, favs;
    try {
      [obras, cats, favs] = await Promise.all([
        CC.api('/centros-custo').then((r) => (Array.isArray(r.data) ? r.data : []).filter((o) => o.ativo !== false || (m && o.id === m.cost_center_id))),
        CC.api('/categorias').then((r) => (Array.isArray(r.data) ? r.data : [])),
        CC.api('/fornecedores').then((r) => (Array.isArray(r.data) ? r.data : []).map((f) => f.nome)).catch(() => []),
      ]);
    } catch (error) { return CC.errorScreen(el, error, () => CC.screens.recorrente(params)); }
    const r = m || { tipo: 'despesa', frequencia: 'mensal' };
    const catOpts = (tipo, atual) => opcoes(categoriasDe(cats, tipo).map((c) => ({ id: c.id, rotulo: c.nome })), 'Escolha a categoria', atual);
    const page = CC.render(`${F.top(titulo, m ? m.nome : 'Vira lançamento todo mês, com frequência, dia e parcelas')}
      <div class="seg" role="group" aria-label="Tipo">${[['despesa', 'Despesa'], ['receita', 'Receita']].map(([k, t]) => `<button type="button" data-tipo="${k}" aria-pressed="${k === r.tipo}">${t}</button>`).join('')}</div>
      ${F.campo('Descrição', 'rf-nome', r.nome, ' maxlength="140" placeholder="Ex.: Locação de plataforma elevatória"')}
      <label class="field"><span>Obra</span><select id="rf-obra">${opcoes(obras.map((o) => ({ id: o.id, rotulo: `${o.codigo} · ${o.nome}` })), 'Escolha a obra', r.cost_center_id)}</select></label>
      <label class="field"><span>Categoria</span><select id="rf-cat">${catOpts(r.tipo, r.category_id)}</select></label>
      <label class="field"><span>Favorecido · opcional</span><input id="rf-fav" list="rf-favs" maxlength="160" value="${esc(r.favorecido || '')}" placeholder="Quem recebe">
        <datalist id="rf-favs">${favs.map((f) => `<option value="${esc(f)}"></option>`).join('')}</datalist></label>
      <div class="grid2">${F.campo('Valor (R$)', 'rf-valor', F.valorBr(r.valor), ' inputmode="decimal" placeholder="0,00"')}
        ${F.campo('Dia do mês', 'rf-dia', r.dia_mes || '', ' type="number" inputmode="numeric" min="1" max="31" placeholder="1 a 31"')}</div>
      <div class="grid2"><label class="field"><span>Frequência</span><select id="rf-freq">${Object.entries(F.FREQ).map(([k, t]) => `<option value="${k}"${k === r.frequencia ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        ${F.campo('Parcelas', 'rf-parc', r.total_parcelas || '', ' type="number" inputmode="numeric" min="1" placeholder="Vazio = sem fim"')}</div>
      ${F.campo('Primeiro mês · opcional', 'rf-ini', r.inicio || '', ' type="month"')}
      <div class="note ok" role="status">${icon('calendar-blank', 18)}<span id="rf-prox">Vazio: começa no próximo dia escolhido.</span></div>
      ${m ? F.troca('rf-ativo', 'Modelo ativo', 'Pausado não gera lançamentos', m.ativo !== false) : ''}
      ${m ? `<button class="btn2 fin-del" type="button" id="rf-del">${icon('trash', 18)}Excluir recorrente</button>` : ''}
      <p class="alert" role="alert" id="err"></p>
      <div class="actions"><button class="btn" type="button" id="salvar">${icon('check', 18)}${m ? 'Salvar alterações' : 'Cadastrar'}</button></div>`, true, params);
    document.body.classList.add('no-tabs');
    F.voltar(page, voltar);
    const v = (id) => CC.$(`#${id}`, page).value;
    let tipo = r.tipo || 'despesa';
    CC.$$('[data-tipo]', page).forEach((b) => b.addEventListener('click', () => {
      tipo = b.dataset.tipo;
      CC.$$('[data-tipo]', page).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      CC.$('#rf-cat', page).innerHTML = catOpts(tipo, v('rf-cat'));
    }));
    let t = 0;
    const proxima = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = new URLSearchParams({ frequencia: v('rf-freq') || 'mensal' });
        if (v('rf-dia')) q.set('dia_mes', v('rf-dia'));
        if (v('rf-parc')) q.set('total_parcelas', v('rf-parc'));
        if (v('rf-ini')) q.set('inicio', v('rf-ini'));
        const alvo = CC.$('#rf-prox', page);
        try {
          const { data } = await CC.api(`/recorrentes/proxima?${q}`);
          if (alvo) alvo.textContent = data.data ? `Próxima geração em ${CC.dateFull(data.data)}.` : 'Sem próximas gerações: as parcelas já terminaram.';
        } catch { /* fica o texto anterior */ }
      }, 250);
    };
    ['rf-dia', 'rf-freq', 'rf-parc', 'rf-ini'].forEach((id) => CC.$(`#${id}`, page).addEventListener('input', proxima));
    proxima();
    CC.$('#salvar', page).addEventListener('click', async (e) => {
      const valor = CC.parseMoney(v('rf-valor'));
      const dia = Number(v('rf-dia')) || null;
      const parc = Number(v('rf-parc')) || null;
      if (!v('rf-nome').trim()) return F.erro(page, 'Informe a descrição.');
      if (!v('rf-obra')) return F.erro(page, 'Escolha a obra.');
      if (!v('rf-cat')) return F.erro(page, 'Escolha a categoria.');
      if (!(valor > 0)) return F.erro(page, 'Informe um valor maior que zero.');
      if (dia && (dia < 1 || dia > 31)) return F.erro(page, 'O dia vai de 1 a 31.');
      if (parc && (!Number.isInteger(parc) || parc < 1)) return F.erro(page, 'Parcelas: use um número inteiro.');
      F.erro(page, '');
      const ativo = CC.$('#rf-ativo', page);
      const body = { nome: v('rf-nome').trim(), tipo, cost_center_id: Number(v('rf-obra')), category_id: Number(v('rf-cat')), favorecido: v('rf-fav').trim(),
        valor, dia_mes: dia, frequencia: v('rf-freq'), total_parcelas: parc, forma_pagamento: r.forma_pagamento || '', ativo: ativo ? ativo.checked : true };
      if (v('rf-ini')) body.inicio = v('rf-ini');
      const b = e.currentTarget;
      CC.busy(b, 'Salvando…');
      try {
        if (m) await CC.api(`/recorrentes/${m.id}`, { method: 'PUT', body });
        else await CC.api('/recorrentes', { method: 'POST', body });
      } catch (error) { F.solta(b, 'check', m ? 'Salvar alterações' : 'Cadastrar'); return F.erro(page, error); }
      CC.toast(m ? 'Recorrente atualizado' : 'Recorrente cadastrado');
      return voltar();
    });
    const del = CC.$('#rf-del', page);
    if (del) del.addEventListener('click', () => excluirSheet(m, voltar));
    return undefined;
  };

  function excluirSheet(m, voltar) {
    const sh = CC.sheet('rec-sheet', `${CC.sheetHead('trash', 'Excluir este recorrente?')}
      <p class="od-txt">"${esc(m.nome)}": os lançamentos já gerados continuam como estão; só o modelo some.</p><div class="lanc-err"></div>
      <div class="grid2 od-acts"><button class="btn2" type="button" id="rx-cancel">Cancelar</button><button class="btn danger" type="button" id="rx-ok">${icon('trash', 18)}Excluir</button></div>`);
    CC.$('#rx-cancel', sh.el).addEventListener('click', sh.close);
    CC.$('#rx-ok', sh.el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      CC.busy(b, 'Excluindo…');
      try { await CC.api(`/recorrentes/${m.id}`, { method: 'DELETE' }); } catch (error) {
        F.solta(b, 'trash', 'Excluir');
        CC.$('.lanc-err', sh.el).innerHTML = CC.sheetErr(error);
        return;
      }
      sh.close();
      CC.toast('Recorrente excluído');
      voltar();
    });
  }
})(window.CC = window.CC || {});
