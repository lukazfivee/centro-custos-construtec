// Menu › Categorias: busca, filtro por tipo, lancamentos e total do mes; nova e editar (p5).
// Mesmas rotas do desktop (public/d/telas/categorias.js e categoria-form.js, routes/categories.js).
// "Receita e despesa" e so o rotulo de "ambos"; o valor no banco continua "ambos".
(function (CC) {
  const { esc, icon, money } = CC;
  const F = CC.fin;
  const TIPOS = [['despesa', 'Despesa'], ['receita', 'Receita'], ['ambos', 'Receita e despesa']];
  const FILTROS = [['', 'Todas'], ...TIPOS];
  // Mesma paleta que o servidor aceita (routes/categories.js).
  const CORES = ['#12a9d1', '#0b4a5c', '#e0a33a', '#8a5cd0', '#c2692a', '#1d7a4f', '#5d7480'];
  const nomeTipo = (t) => (TIPOS.find(([k]) => k === t) || TIPOS[2])[1];
  const corOk = (c) => (CORES.includes(String(c || '').toLowerCase()) ? String(c).toLowerCase() : '');
  let estado = { filtro: '', busca: '' };

  const linha = (c, pode) => `<button type="button" class="row fin-row" data-cat="${esc(c.id)}"${pode ? '' : ' disabled'}>
    <span class="line"><span class="fin-cor" style="${corOk(c.cor) ? `background:${corOk(c.cor)}` : ''}"></span><span class="grow name">${esc(c.nome)}</span>
      <span class="tag${c.ativo === false ? '' : ({ despesa: ' fin-warn', receita: ' fin-ok' }[c.tipo] || '')}">${c.ativo === false ? 'Inativa' : esc(nomeTipo(c.tipo))}</span></span>
    ${c.descricao ? `<span class="cli">${esc(c.descricao)}</span>` : ''}
    <span class="line foot"><span class="grow">${esc(F.plural(Number(c.lancamentos_mes) || 0, 'lançamento no mês', 'lançamentos no mês'))}</span>
      <b class="fin-val">${esc(Number(c.total_mes) ? money(c.total_mes) : '—')}</b></span></button>`;

  CC.screens.categorias = async function (params) {
    const voltar = () => CC.go('menu');
    const el = F.carregando('Categorias', '', voltar);
    const mes = CC.month();
    let result;
    try { [result] = await Promise.all([CC.cached(`categorias-${mes}`, `/categorias?mes=${mes}`), F.perms()]); } catch (error) {
      return CC.errorScreen(el, error, () => CC.screens.categorias(params));
    }
    const todas = Array.isArray(result.data) ? result.data : [];
    const pode = F.podeCadastrar();
    const ativas = todas.filter((c) => c.ativo !== false).length;
    const nova = pode ? `<button class="back" type="button" id="ca-nova" aria-label="Nova categoria">${icon('plus', 22)}</button>` : '';
    const page = CC.render(`${F.top('Categorias', `${F.plural(ativas, 'ativa', 'ativas')} · usadas nos lançamentos`, nova)}${CC.staleNote(result)}
      ${F.busca('ca-busca', estado.busca, 'Buscar categoria')}
      <div class="chips" role="group" aria-label="Tipo da categoria">${FILTROS.map(([k, l]) => `<button class="chip-act" type="button" data-filtro="${k}" aria-pressed="${k === estado.filtro}">${l}</button>`).join('')}</div>
      <div id="ca-lista"></div>`, true, params);
    F.voltar(page, voltar);
    const pintar = () => {
      const q = estado.busca.trim().toLowerCase();
      const vis = todas.filter((c) => (!estado.filtro || c.tipo === estado.filtro) && (!q || [c.nome, c.descricao].join(' ').toLowerCase().includes(q)));
      const soma = vis.reduce((s, c) => s + Math.round(CC.cents(c.total_mes) * 100), 0) / 100;
      const slot = CC.$('#ca-lista', page);
      slot.innerHTML = vis.length ? `<div class="kv lanc-total"><span>${esc(`${vis.length} de ${todas.length}`)} · total de ${esc(F.mesCurto(mes))}</span><b>${esc(money(soma))}</b></div>
        <div class="rows">${vis.map((c) => linha(c, pode)).join('')}</div>` : `<div class="empty">${icon('funnel', 28)}Nenhuma categoria encontrada.</div>`;
      CC.$$('[data-cat]', slot).forEach((b) => b.addEventListener('click', () => CC.go('categoria', { cat: todas.find((c) => String(c.id) === b.dataset.cat) })));
    };
    F.ligarBusca(page, 'ca-busca', (texto) => { estado.busca = texto; pintar(); });
    CC.$$('[data-filtro]', page).forEach((b) => b.addEventListener('click', () => {
      estado.filtro = b.dataset.filtro;
      CC.$$('[data-filtro]', page).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pintar();
    }));
    const bNova = CC.$('#ca-nova', page);
    if (bNova) bNova.addEventListener('click', () => CC.go('categoria', {}));
    pintar();
    return undefined;
  };

  // Nova e editar categoria: nome, tipo, descricao, cor e ativa. params: { cat }.
  CC.screens.categoria = async function (params) {
    const cat = (params && params.cat) || null;
    const voltar = () => CC.go('categorias');
    const c = cat || { tipo: 'despesa', cor: CORES[0] };
    let tipo = c.tipo || 'despesa', cor = corOk(c.cor) || null;
    const page = CC.render(`${F.top(cat ? 'Editar categoria' : 'Nova categoria', cat ? cat.nome : 'Usada para agrupar lançamentos e no painel')}
      ${F.campo('Nome da categoria', 'cf-nome', c.nome, ' maxlength="100" placeholder="Ex.: Licenças de software"')}
      <div class="field"><span>Tipo padrão</span><div class="seg" role="group" aria-label="Tipo padrão">${TIPOS.map(([k, t]) => `<button type="button" data-tipo="${k}" aria-pressed="${k === tipo}">${t}</button>`).join('')}</div></div>
      <label class="field"><span>Descrição · opcional</span><textarea id="cf-desc" rows="2" maxlength="200" placeholder="Ex.: Softwares de gestão de vídeo e de alarme">${esc(c.descricao || '')}</textarea></label>
      <div class="field"><span>Cor no painel</span><div class="fin-paleta" role="group" aria-label="Cor no painel">${CORES.map((k) =>
        `<button type="button" data-cor="${k}" style="background:${k}" aria-label="Cor ${k}" aria-pressed="${k === cor}"></button>`).join('')}</div></div>
      ${F.troca('cf-ativa', 'Categoria ativa', 'Inativa não aparece em lançamentos novos; os antigos ficam como estão', c.ativo !== false)}
      ${cat && Number(cat.lancamentos_mes) ? `<div class="note ok">${icon('info', 18)}<span>${esc(`${F.plural(Number(cat.lancamentos_mes), 'lançamento deste mês usa', 'lançamentos deste mês usam')} esta categoria.`)}</span></div>` : ''}
      <p class="alert" role="alert" id="err"></p>
      <div class="actions"><button class="btn" type="button" id="salvar">${icon('check', 18)}${cat ? 'Salvar alterações' : 'Cadastrar'}</button></div>`, true, params);
    document.body.classList.add('no-tabs');
    F.voltar(page, voltar);
    CC.$$('[data-tipo]', page).forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.tipo; CC.$$('[data-tipo]', page).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
    CC.$$('[data-cor]', page).forEach((b) => b.addEventListener('click', () => { cor = b.dataset.cor; CC.$$('[data-cor]', page).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
    CC.$('#salvar', page).addEventListener('click', async (e) => {
      const nome = CC.$('#cf-nome', page).value.trim();
      if (!nome) return F.erro(page, 'Informe o nome da categoria.');
      F.erro(page, '');
      const body = { nome, tipo, descricao: CC.$('#cf-desc', page).value.trim(), cor, ativo: CC.$('#cf-ativa', page).checked };
      const b = e.currentTarget;
      CC.busy(b, 'Salvando…');
      try {
        if (cat) await CC.api(`/categorias/${cat.id}`, { method: 'PUT', body });
        else await CC.api('/categorias', { method: 'POST', body });
      } catch (error) { F.solta(b, 'check', cat ? 'Salvar alterações' : 'Cadastrar'); return F.erro(page, error); }
      CC.toast(cat ? 'Categoria atualizada' : 'Categoria cadastrada');
      return voltar();
    });
    return undefined;
  };
})(window.CC = window.CC || {});
