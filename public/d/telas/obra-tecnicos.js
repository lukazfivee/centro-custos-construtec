// Tecnicos com acesso a obra ou ao servico (desktop): botao "Tecnicos (n)" no cabecalho que abre o
// painel lateral padrao. Substitui o bloco <details> do celular, que se repetia acima de todas as abas.
(function (CC) {
  const D = CC.d;
  const { esc } = CC;
  const T = D.tecnicos = {};

  T.botao = () => `<button type="button" class="btn btn-s" data-tecnicos>${D.ic('users-three')}<span data-tecnicos-rot>Técnicos</span></button>`;

  const ativos = (d) => d.atribuidos.filter((uid) => d.tecnicos.some((u) => u.id === uid));

  // raiz: elemento da tela; id: obra ou servico.
  T.ligar = (raiz, id) => {
    const bt = CC.$('[data-tecnicos]', raiz);
    if (!bt) return;
    let dados = null;
    const rotulo = () => {
      const n = dados ? ativos(dados).length : 0;
      CC.$('[data-tecnicos-rot]', bt).textContent = n ? `Técnicos (${n})` : 'Técnicos';
    };
    const carregar = async () => { ({ data: dados } = await CC.api(`/centros-custo/${Number(id)}/tecnicos`)); rotulo(); };
    carregar().catch(() => {});
    bt.addEventListener('click', async () => {
      try { await carregar(); } catch (error) { CC.toast(error.message || 'Não foi possível carregar os técnicos.', 'warning-circle'); return; }
      abrir();
    });

    async function abrir() {
      const inativos = dados.atribuidos.length !== ativos(dados).length;
      const lista = dados.tecnicos.length
        ? `<div class="tc-lista" role="group" aria-label="Técnicos com acesso">${dados.tecnicos.map((u) => `<label class="tc-linha"><input type="checkbox" name="tecnico" value="${esc(u.id)}"${dados.atribuidos.includes(u.id) ? ' checked' : ''}><span>${esc(u.nome)}</span></label>`).join('')}</div>`
        : D.ui.vazio('users-three', 'Nenhum técnico ativo cadastrado.', 'Cadastre o técnico em Usuários para designá-lo aqui.');
      const ctl = await D.painel.abrir({
        icone: 'users-three', titulo: 'Técnicos', sub: 'Quem acessa a execução deste item',
        corpo: `${inativos ? D.ui.faixa('warn', 'warning', 'Há técnicos inativos designados. Ao salvar, eles saem da lista.') : ''}
          <p class="muted">Os marcados veem este item no celular. Para tirar o acesso, desmarque e salve.</p>${lista}`,
        rodape: `<button type="button" class="btn btn-s" data-fechar>Cancelar</button>${dados.tecnicos.length ? `<button type="button" class="btn btn-p" data-salvar>${D.ic('check')}Salvar técnicos</button>` : ''}`,
      });
      if (!ctl) return;
      CC.$$('input', ctl.corpo).forEach((i) => i.addEventListener('change', () => { ctl.sujo = true; }));
      const salvar = CC.$('[data-salvar]', ctl.rodape);
      if (!salvar) return;
      salvar.addEventListener('click', async () => {
        const tecnicos = CC.$$('input[name="tecnico"]:checked', ctl.corpo).map((i) => Number(i.value));
        const voltar = D.ui.ocupar(salvar, 'Salvando…');
        try {
          const { data } = await CC.api(`/centros-custo/${Number(id)}/tecnicos`, { method: 'PUT', body: { tecnicos, anteriores: dados.atribuidos } });
          dados = { ...dados, atribuidos: data.atribuidos };
          rotulo();
          ctl.marcarSalvo();
          ctl.fechar(true);
          CC.toast('Técnicos atualizados');
        } catch (error) {
          voltar();
          ctl.erro(error.status === 409 ? 'Outra pessoa mudou os técnicos agora. Feche e abra de novo para ver a lista atual.' : (error.message || 'Não foi possível salvar. Tente novamente.'));
        }
      });
    }
  };
})(window.CC);
