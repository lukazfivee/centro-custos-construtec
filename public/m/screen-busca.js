// Busca global do celular: a partir de 2 letras, procura obras e servicos (nome, codigo, cliente) e
// lancamentos (descricao, fornecedor, nota). Mesmas rotas do desktop (public/d/busca.js). Tocar abre o item.
(function (CC) {
  const { esc, icon } = CC;
  let obras = null, obrasEm = 0;
  const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  async function listaObras() {
    if (obras && Date.now() - obrasEm < 60000) return obras;
    const { data } = await CC.cached('busca-obras', '/centros-custo');
    obras = Array.isArray(data) ? data : [];
    obrasEm = Date.now();
    return obras;
  }

  async function procurar(q) {
    const alvo = normal(q);
    const [lista, lancs] = await Promise.all([listaObras().catch(() => []),
      CC.api(`/lancamentos?busca=${encodeURIComponent(q)}&limite=8&pagina=1`).then((r) => r.data.itens || [])]);
    const achadas = lista.filter((o) => normal([o.nome, o.codigo, o.cliente].join(' ')).includes(alvo)).slice(0, 5);
    return { achadas, lancs };
  }

  // Botao com cara de campo (Inicio) que abre a busca.
  CC.buscaCampo = () => `<button class="field busca hp-busca" type="button" id="hp-busca" aria-haspopup="dialog">${icon('magnifying-glass', 18)}<span>Buscar obras e lançamentos</span></button>`;

  // from: para onde o Voltar do detalhe do lancamento leva.
  CC.busca = function (from) {
    const sh = CC.sheet('busca', `${CC.sheetHead('magnifying-glass', 'Buscar')}
      <label class="field busca"><span class="sr">Buscar</span>${icon('magnifying-glass', 18)}<input id="bg-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Obra, cliente, descrição ou fornecedor"></label>
      <div id="bg-res" class="bg-res" aria-live="polite"><p class="sub mt-vazio">Digite pelo menos 2 letras.</p></div>`);
    const input = CC.$('#bg-q', sh.el), res = CC.$('#bg-res', sh.el);
    let vez = 0, timer = 0, achados = { achadas: [], lancs: [] };
    const abrir = (fn) => { sh.close(); fn(); };
    const pintar = (q) => {
      const { achadas, lancs } = achados;
      if (!achadas.length && !lancs.length) { res.innerHTML = `<p class="sub mt-vazio">Nada encontrado para "${esc(q)}".</p>`; return; }
      res.innerHTML = `${achadas.length ? `<span class="label">Obras e serviços</span>${achadas.map((o) => `<button class="tx tx-btn bg-obra" type="button" data-obra="${esc(o.id)}" data-sv="${o.tipo === 'servico' ? '1' : ''}">
          <span class="bg-ic">${icon(o.tipo === 'servico' ? 'wrench' : 'buildings', 18)}</span><span class="grow"><b>${esc(o.nome)}</b><small>${esc([o.tipo === 'servico' ? 'Serviço' : '', o.codigo, o.cliente].filter(Boolean).join(' · '))}</small></span>${icon('caret-right', 16)}</button>`).join('')}` : ''}
        ${lancs.length ? `<span class="label">Lançamentos</span>${lancs.map((t) => CC.txRow(t, [t.centro_nome, CC.dateBr(t.data)].filter(Boolean).join(' · '))).join('')}` : ''}`;
      CC.$$('[data-obra]', res).forEach((b) => b.addEventListener('click', () => abrir(() => CC.go(b.dataset.sv ? 'servico' : 'obra', { id: Number(b.dataset.obra) }))));
      CC.$$('[data-tx]', res).forEach((b) => b.addEventListener('click', () => abrir(() => CC.go('lanc', { id: Number(b.dataset.tx), from: from || ['home'] }))));
    };
    const buscar = async () => {
      const q = input.value.trim(), minha = ++vez;
      if (q.length < 2) { res.innerHTML = '<p class="sub mt-vazio">Digite pelo menos 2 letras.</p>'; return; }
      res.innerHTML = '<div class="skeleton"></div>';
      try {
        const r = await procurar(q);
        if (minha !== vez) return;
        achados = r;
        pintar(q);
      } catch (error) {
        if (minha !== vez) return;
        res.innerHTML = `<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 24)}${esc(error.status === 0 ? 'Sem internet. A busca volta quando a conexão voltar.' : error.message)}</div>`;
      }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(buscar, 300); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); input.blur(); buscar(); } });
    setTimeout(() => input.focus(), 50);
  };
})(window.CC = window.CC || {});
