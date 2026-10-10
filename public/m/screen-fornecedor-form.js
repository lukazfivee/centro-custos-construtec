// Novo e editar fornecedor: dados, categoria mais comum, ativo e lancamentos do mes (GET /fornecedores/:id/resumo).
// Mesmos campos do desktop (public/d/telas/fornecedor-form.js). O servidor confere o CPF/CNPJ e recusa repetido (p5).
(function (CC) {
  const { esc, icon, money } = CC;
  const F = CC.fin;

  async function doMes(slot, f, mes) {
    try {
      const { data } = await CC.api(`/fornecedores/${f.id}/resumo?mes=${mes}`);
      if (!document.body.contains(slot)) return;
      slot.innerHTML = `<div class="kv"><span class="label">Lançamentos em ${esc(F.mesCurto(mes))}</span><b>${esc(money(data.gasto_mes))}</b></div>
        ${data.lancamentos.length ? data.lancamentos.map((l) => {
          const v = Number(l.valor) * Number(l.sinal || 1) * (l.tipo === 'receita' ? 1 : -1);
          return `<button class="tx tx-btn" type="button" data-tx="${Number(l.id)}"><span class="grow"><b>${esc(l.descricao)}</b><small>${esc(`${l.obra_codigo} · ${CC.dateFull(l.data)} · ${l.status === 'liquidado' ? (l.tipo === 'receita' ? 'Recebido' : 'Pago') : (l.tipo === 'receita' ? 'A receber' : 'A pagar')}`)}</small></span>
            <span class="amt${v > 0 ? ' in' : ''}">${esc(CC.signed(v))}</span></button>`;
        }).join('') : '<p class="sub fin-nota">Nenhum lançamento neste mês.</p>'}`;
      CC.wireTx(slot, ['fornecedor', { forn: f }]);
    } catch { slot.innerHTML = ''; }
  }

  // params: { forn } (linha da lista; sem ela, novo fornecedor).
  CC.screens.fornecedor = async function (params) {
    const f = (params && params.forn) || null;
    const voltar = () => CC.go('fornecedores');
    const titulo = f ? f.nome : 'Novo fornecedor';
    const el = F.carregando(titulo, '', voltar);
    let cats;
    try { cats = await CC.api('/categorias').then((r) => (Array.isArray(r.data) ? r.data : []).filter((c) => c.ativo !== false && c.tipo !== 'receita')); } catch (error) {
      if (error.status !== 0) return CC.errorScreen(el, error, () => CC.screens.fornecedor(params));
      cats = [];
    }
    const d = f || {};
    const page = CC.render(`${F.top(titulo, f ? [f.documento, f.contato].filter(Boolean).join(' · ') : 'Quem recebe os pagamentos')}
      ${F.campo('Nome ou razão social', 'fo-nome', d.nome, ' maxlength="160" placeholder="Ex.: Seg Distribuidora"')}
      ${F.campo('CPF ou CNPJ', 'fo-doc', d.documento, ' inputmode="numeric" maxlength="30" placeholder="00.000.000/0000-00"')}
      <label class="field"><span>Categoria mais comum</span><select id="fo-cat"><option value="">Nenhuma</option>
        ${cats.map((c) => `<option value="${esc(c.id)}"${String(c.id) === String(d.categoria_id) ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <div class="grid2">${F.campo('Contato', 'fo-cont', d.contato, ' maxlength="120"')}${F.campo('Telefone', 'fo-tel', d.telefone, ' type="tel" maxlength="40" placeholder="(11) 90000-0000"')}</div>
      ${F.campo('E-mail', 'fo-email', d.email, ' type="email" maxlength="180" autocapitalize="off"')}
      ${f ? F.troca('fo-ativo', 'Fornecedor ativo', '', f.ativo !== false) : ''}
      ${f ? '<div class="card" id="fo-mes"><div class="skeleton"></div></div>' : ''}
      <p class="alert" role="alert" id="err"></p>
      <div class="actions"><button class="btn" type="button" id="salvar">${icon('check', 18)}${f ? 'Salvar alterações' : 'Cadastrar'}</button></div>`, true, params);
    document.body.classList.add('no-tabs');
    F.voltar(page, voltar);
    if (f) doMes(CC.$('#fo-mes', page), f, CC.month());
    CC.$('#salvar', page).addEventListener('click', async (e) => {
      const v = (id) => CC.$(`#${id}`, page).value.trim();
      const body = { nome: v('fo-nome'), documento: v('fo-doc'), contato: v('fo-cont'), telefone: v('fo-tel'), email: v('fo-email'), categoria_id: v('fo-cat') || null };
      const n = body.documento.replace(/\D/g, '');
      if (!body.nome) return F.erro(page, 'Informe o nome do fornecedor.');
      if (body.documento && n.length !== 11 && n.length !== 14) return F.erro(page, 'CPF precisa de 11 dígitos e CNPJ de 14.');
      if (body.email && !/^\S+@\S+\.\S+$/.test(body.email)) return F.erro(page, 'E-mail inválido.');
      const ativo = CC.$('#fo-ativo', page);
      body.ativo = ativo ? ativo.checked : true;
      F.erro(page, '');
      const b = e.currentTarget;
      CC.busy(b, 'Salvando…');
      try {
        if (f) await CC.api(`/fornecedores/${f.id}`, { method: 'PUT', body });
        else await CC.api('/fornecedores', { method: 'POST', body });
      } catch (error) { F.solta(b, 'check', f ? 'Salvar alterações' : 'Cadastrar'); return F.erro(page, error); }
      CC.toast(f ? 'Fornecedor atualizado' : 'Fornecedor cadastrado');
      return voltar();
    });
    return undefined;
  };
})(window.CC = window.CC || {});
