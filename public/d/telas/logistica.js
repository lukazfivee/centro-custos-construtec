// Logistica: casca da tela. Cada aba mora em seu proprio arquivo (logistica-*.js) e registra-se em D.logi.modulos.
// A casca guarda a aba atual, busca so os dados da aba e os reaproveita ate algo ser registrado.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const L = D.logi;
  const { esc } = CC;

  const ABAS = [['resumo', 'Resumo'], ['ferramental', 'Ferramental'], ['materiais', 'Materiais'], ['pendencias', 'Pendências'], ['historico', 'Histórico']];
  // Enderecos antigos (#/logistica/faltas etc.) continuam levando ao lugar certo.
  const LEGADO = { ferramentas: ['ferramental', 'inventario'], kits: ['ferramental', 'kit'], faltas: ['pendencias'], movimentacoes: ['historico', 'ferramentas'], solicitacoes: ['materiais', 'pedidos'] };
  const API = {
    resumo: '/logistica/resumo', ferramentas: '/logistica/ferramentas', kit: '/logistica/kits/padrao', movFerr: '/logistica/movimentacoes',
    materiais: '/logistica/materiais', pedidos: '/logistica/materiais/solicitacoes', opcoes: '/logistica/materiais/opcoes-entrega',
    movMat: '/logistica/materiais/movimentacoes', faltas: '/logistica/faltas', devolucoes: '/logistica/materiais/devolucoes-pendentes',
  };
  const estado = { aba: 'resumo', sub: { ferramental: 'inventario', materiais: 'estoque', historico: 'ferramentas' }, busca: '', status: '' };

  async function render(el, rota, vivo) {
    if (!D.podeTela(rota.nome)) return D.telaEmConstrucao(el, rota, vivo);
    const legado = LEGADO[rota.id], destino = legado ? legado[0] : rota.id;
    if (ABAS.some(([chave]) => chave === destino)) { estado.aba = destino; if (legado && legado[1]) estado.sub[destino] = legado[1]; }
    el.innerHTML = `<div class="pagina logi-pagina">${U.cabecalho({ titulo: 'Logística', sub: 'Ferramentas, materiais e fichas dos técnicos' })}
      <div class="abas-pagina logi-abas" role="tablist" aria-label="Seções da logística">${ABAS.map(([chave, rotulo]) => `<button type="button" class="tab" role="tab" id="logi-aba-${chave}" data-aba="${chave}" aria-controls="logi-painel">${rotulo}</button>`).join('')}</div>
      <div class="logi-painel" id="logi-painel" role="tabpanel" tabindex="0" data-corpo></div></div>`;
    const corpo = CC.$('[data-corpo]', el), barra = CC.$('.cab .acoes', el), abas = CC.$$('[role=tab]', el);
    let cache = {}, sequencia = 0;

    const ctx = {
      el, corpo, estado,
      get dados() { return cache; },
      carregar: async (chaves) => {
        await Promise.all(chaves.filter((chave) => !(chave in cache)).map(async (chave) => { cache[chave] = (await CC.api(API[chave])).data; }));
        return cache;
      },
      // Troca de aba ou de visao; filtro opcional { status, busca } para abrir a lista ja filtrada.
      ir: (aba, sub, filtro) => {
        estado.aba = aba;
        if (sub) estado.sub[aba] = sub;
        if (filtro && 'status' in filtro) estado.status = filtro.status;
        if (filtro && 'busca' in filtro) estado.busca = filtro.busca;
        return mostrar();
      },
      // Depois de registrar algo: descarta os dados guardados e refaz a aba atual.
      atualizar: () => { cache = {}; return mostrar(); },
    };

    async function mostrar() {
      const modulo = L.modulos[estado.aba], id = ++sequencia;
      abas.forEach((aba) => { const ativa = aba.dataset.aba === estado.aba; aba.setAttribute('aria-selected', ativa ? 'true' : 'false'); aba.tabIndex = ativa ? 0 : -1; });
      corpo.setAttribute('aria-labelledby', `logi-aba-${estado.aba}`);
      barra.innerHTML = modulo.acoes.map(([chave, tipo, icone, rotulo]) => `<button type="button" class="btn btn-${tipo}" data-acao="${chave}">${D.ic(icone)}${esc(rotulo)}</button>`).join('');
      CC.$$('[data-acao]', barra).forEach((botao, i) => botao.addEventListener('click', () => modulo.acoes[i][4](ctx)));
      const chaves = modulo.dados(estado);
      if (chaves.some((chave) => !(chave in cache))) corpo.innerHTML = U.carregando('Carregando…');
      try {
        await ctx.carregar(chaves);
        if (!vivo() || id !== sequencia) return;
        modulo.desenhar(ctx);
        L.rotular(corpo);
      } catch (error) {
        if (vivo() && id === sequencia) corpo.innerHTML = U.faixa('err', 'warning-circle', error.message || 'Não foi possível carregar a logística.');
      }
    }

    const lista = CC.$('[role=tablist]', el);
    lista.addEventListener('click', (event) => { const aba = event.target.closest('[data-aba]'); if (aba && aba.dataset.aba !== estado.aba) ctx.ir(aba.dataset.aba); });
    lista.addEventListener('keydown', (event) => {
      const atual = ABAS.findIndex(([chave]) => chave === estado.aba);
      const proximo = { ArrowRight: (atual + 1) % ABAS.length, ArrowLeft: (atual - 1 + ABAS.length) % ABAS.length, Home: 0, End: ABAS.length - 1 }[event.key];
      if (proximo === undefined) return;
      event.preventDefault();
      ctx.ir(ABAS[proximo][0]);
      abas[proximo].focus();
    });
    mostrar();
  }

  D.tela('logistica', { render });
})(window.CC);
