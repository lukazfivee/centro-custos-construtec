// Menu › Fornecedores: busca por nome, CPF/CNPJ ou contato, gasto e lancamentos do mes, CSV.
// Mesmas rotas do desktop (public/d/telas/fornecedores.js, routes/suppliers.js). Ler e baixar o CSV:
// qualquer pessoa logada (usuario restrito soma so as obras dele); cadastrar e editar exigem p5.
(function (CC) {
  const { esc, icon, money } = CC;
  const F = CC.fin;
  let busca = '';

  const linha = (f, pode) => `<button type="button" class="row fin-row" data-forn="${esc(f.id)}"${pode ? '' : ' disabled'}>
    <span class="line"><span class="grow name">${esc(f.nome)}</span>${f.ativo === false ? '<span class="tag">Inativo</span>' : ''}</span>
    <span class="cli">${esc([f.documento, f.contato, f.telefone].filter(Boolean).join(' · ') || 'Sem documento nem contato')}</span>
    <span class="line foot"><span class="grow">${esc(F.plural(Number(f.lancamentos_mes) || 0, 'lançamento no mês', 'lançamentos no mês'))}</span>
      <b class="fin-val">${esc(Number(f.gasto_mes) ? money(f.gasto_mes) : '—')}</b></span></button>`;

  CC.screens.fornecedores = async function (params) {
    const voltar = () => CC.go('menu');
    const el = F.carregando('Fornecedores', '', voltar);
    const mes = CC.month();
    let result;
    try { [result] = await Promise.all([CC.cached(`fornecedores-${mes}`, `/fornecedores?mes=${mes}`), F.perms()]); } catch (error) {
      return CC.errorScreen(el, error, () => CC.screens.fornecedores(params));
    }
    const todos = Array.isArray(result.data) ? result.data : [];
    const pode = F.podeCadastrar();
    const acoes = `<button class="back" type="button" id="fo-csv" aria-label="Baixar ou compartilhar CSV">${icon('download-simple', 22)}</button>
      ${pode ? `<button class="back" type="button" id="fo-novo" aria-label="Novo fornecedor">${icon('plus', 22)}</button>` : ''}`;
    const page = CC.render(`${F.top('Fornecedores', `${F.plural(todos.length, 'cadastrado', 'cadastrados')} · gasto de ${CC.mesNome(mes).toLowerCase()}`, acoes)}
      ${CC.staleNote(result)}${F.busca('fo-busca', busca, 'Nome, CPF/CNPJ ou contato')}<div id="fo-lista"></div>`, true, params);
    F.voltar(page, voltar);
    const pintar = () => {
      const q = busca.trim().toLowerCase();
      const dig = q.replace(/\D/g, '');
      const vis = todos.filter((f) => !q || `${f.nome} ${f.contato || ''}`.toLowerCase().includes(q) || (dig && String(f.documento || '').replace(/\D/g, '').includes(dig)));
      const soma = vis.reduce((s, f) => s + Math.round(CC.cents(f.gasto_mes) * 100), 0) / 100;
      const slot = CC.$('#fo-lista', page);
      slot.innerHTML = vis.length ? `<div class="kv lanc-total"><span>${esc(`${vis.length} de ${todos.length}`)} · gasto em ${esc(F.mesCurto(mes))}</span><b>${esc(money(soma))}</b></div>
        <div class="rows">${vis.map((f) => linha(f, pode)).join('')}</div>` : `<div class="empty">${icon('hard-hat', 28)}Nenhum fornecedor encontrado.</div>`;
      CC.$$('[data-forn]', slot).forEach((b) => b.addEventListener('click', () => CC.go('fornecedor', { forn: todos.find((f) => String(f.id) === b.dataset.forn) })));
    };
    F.ligarBusca(page, 'fo-busca', (texto) => { busca = texto; pintar(); });
    CC.$('#fo-csv', page).addEventListener('click', () => F.csvDaApi('/fornecedores/exportar.csv', 'fornecedores.csv')
      .catch((error) => CC.toast(error.status === 0 ? 'Sem internet para gerar o CSV.' : error.message, 'warning-circle')));
    const novo = CC.$('#fo-novo', page);
    if (novo) novo.addEventListener('click', () => CC.go('fornecedor', {}));
    pintar();
    return undefined;
  };
})(window.CC = window.CC || {});
