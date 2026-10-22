// Central de Ajuda do Centro de Custos: atalhos, regras de lancamento e fechamento, perfis, sobre e como reportar problema.
// Mesmo desenho do dialogo de ajuda do Orçamentos (abas em chips, cartoes de atalho), com o conteudo deste app.
(function (CC) {
  const D = CC.d;
  const { esc } = CC;

  const ATALHOS = [
    [['Ctrl', 'K'], 'Busca rápida', 'Procura lançamentos, obras e fornecedores em qualquer tela.'],
    [['Ctrl', 'B'], 'Recolher ou abrir o menu', 'Alterna o menu lateral; a escolha fica guardada neste computador.'],
    [['Esc'], 'Fechar', 'Fecha esta janela, painéis laterais, menus e a busca.'],
    [['Enter'], 'Abrir a linha selecionada', 'Nas listas, abre o item que está com o foco.'],
  ];

  const kbd = (tecla) => `<kbd>${esc(tecla)}</kbd>`;
  const atalhos = () => `<div class="aj-sec">
    <p class="aj-desc">Teclas para trabalhar mais rápido sem tirar a mão do teclado:</p>
    <div class="aj-grade">${ATALHOS.map(([teclas, titulo, texto]) => `<div class="aj-atalho">
      <div class="aj-teclas">${teclas.map(kbd).join(' + ')}</div>
      <div class="aj-info"><b>${esc(titulo)}</b><span>${esc(texto)}</span></div></div>`).join('')}</div></div>`;

  const bloco = (titulo, texto, formula) => `<div class="aj-item"><h3>${esc(titulo)}</h3><p>${texto}</p>${formula ? `<div class="aj-formula"><code>${esc(formula)}</code></div>` : ''}</div>`;
  const regras = () => `<div class="aj-sec">
    ${bloco('Lançamentos', 'Cada receita ou despesa tem <b>competência</b> (o mês a que pertence), <b>vencimento</b> e situação. Use <b>Pendente</b> enquanto a conta não foi paga ou recebida; ao liquidar, mude para <b>Liquidado</b> e informe a data.')}
    ${bloco('Obras e orçamento', 'Cada obra (centro de custo) tem um orçamento mensal. <b>Comprometido</b> soma todas as despesas do mês, pagas ou pendentes; <b>Pago/recebido</b> considera só o que foi liquidado.', 'Saldo do orçamento = orçamento mensal − comprometido')}
    ${bloco('Cobranças', 'A cobrança acompanha o recebimento de um serviço: nota fiscal, vencimento e pagamento. O e-mail ao cliente sai em nome de quem envia, com resposta para a sua conta.')}
    ${bloco('Fechamento mensal', 'Conferir e fechar o mês trava os lançamentos daquele período. Para corrigir depois, reabra o fechamento ou use um <b>estorno</b>; tudo fica registrado em <b>Histórico</b>, com quem fez e quando.')}
  </div>`;

  const perfis = () => `<div class="aj-sec">
    <div class="aj-cartao"><div class="aj-selo">${D.ic('shield-check', 18)} Administrador</div><p>Acesso total: usuários, cadastros, exclusões, backup e restauração.</p></div>
    <div class="aj-cartao"><div class="aj-selo">${D.ic('user-check', 18)} Gestor</div><p>Lançamentos, exclusões, obras, categorias, fornecedores, relatórios e sincronização.</p></div>
    <div class="aj-cartao"><div class="aj-selo">${D.ic('user', 18)} Supervisor</div><p>Cria e edita lançamentos e consulta painéis e relatórios. Não gerencia usuários, cadastros estruturais, backup nem exclusões.</p></div>
    <p class="aj-desc">Menus e botões sem permissão não aparecem. Cada pessoa deve usar o próprio usuário.</p>
  </div>`;

  const sobre = () => {
    const linha = (k, v) => `<div class="aj-linha"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`;
    return `<div class="aj-sec"><div class="aj-sobre">
      ${linha('Aplicativo', 'Centro de Custos Construtec')}
      ${linha('Onde roda', window.electronAPI ? 'Aplicativo do Windows, funciona sem internet' : 'Site da Suíte')}
      ${linha('Seu perfil', D.papelNome())}
      ${linha('Empresa', 'LAC Construtec Construtora Eireli')}
    </div></div>`;
  };

  const reportar = () => `<div class="aj-sec">
    <p class="aj-desc">Encontrou algo errado? Conte o que aconteceu ao assistente: ele monta o relato e envia para o suporte.</p>
    <div><button type="button" class="btn btn-p" data-aj-reportar>${D.ic('sparkle-fill', 16)} Reportar com o assistente</button></div>
  </div>`;

  const ABAS = [
    ['atalhos', 'keyboard', 'Atalhos', atalhos],
    ['regras', 'calculator', 'Regras', regras],
    ['perfis', 'lock', 'Perfis', perfis],
    ['sobre', 'info', 'Sobre', sobre],
    ['reportar', 'chat-circle-dots', 'Reportar problema', reportar],
  ];

  D.abrirAjuda = function () {
    if (document.querySelector('.aj-camada')) return;
    const anterior = document.activeElement;
    const camada = D.el(`<div class="dialogo-camada aj-camada">
      <div class="card dialogo aj-dlg" role="dialog" aria-modal="true" aria-labelledby="aj-tit">
        <header class="aj-cab"><span class="dic">${D.ic('question')}</span>
          <div><b id="aj-tit">Ajuda</b><span class="aj-sub">Atalhos, regras e perfis do Centro de Custos</span></div>
          <button type="button" class="ibtn" data-aj-fechar aria-label="Fechar">${D.ic('x', 18)}</button></header>
        <nav class="aj-abas" aria-label="Seções de ajuda">${ABAS.map(([k, ic, nome]) => `<button type="button" data-aj-aba="${k}">${D.ic(ic, 15)} ${esc(nome)}</button>`).join('')}</nav>
        <div class="aj-corpo" tabindex="-1"></div>
        <footer class="aj-rod"><span>Esc fecha esta janela.</span><button type="button" class="btn btn-p" data-aj-fechar>Entendido</button></footer>
      </div></div>`);
    const corpo = CC.$('.aj-corpo', camada);
    const mostrar = (chave) => {
      const aba = ABAS.find((a) => a[0] === chave) || ABAS[0];
      corpo.innerHTML = aba[3]();
      CC.$$('[data-aj-aba]', camada).forEach((b) => { const ativa = b.dataset.ajAba === aba[0]; b.classList.toggle('ativa', ativa); b.setAttribute('aria-pressed', ativa ? 'true' : 'false'); });
      corpo.scrollTop = 0;
    };
    const fechar = () => {
      document.removeEventListener('keydown', teclas, true);
      camada.remove();
      if (anterior && anterior.focus) anterior.focus();
    };
    const teclas = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); fechar(); return; }
      D.prenderFoco(camada, event);
    };
    camada.addEventListener('click', (event) => {
      if (event.target === camada || event.target.closest('[data-aj-fechar]')) { fechar(); return; }
      const aba = event.target.closest('[data-aj-aba]');
      if (aba) { mostrar(aba.dataset.ajAba); return; }
      if (event.target.closest('[data-aj-reportar]')) {
        fechar();
        if (CC.ia && CC.ia.open) CC.ia.open('Quero reportar um problema no app.');
        else CC.toast('O assistente não está disponível agora.', 'warning-circle');
      }
    });
    document.addEventListener('keydown', teclas, true);
    document.body.appendChild(camada);
    mostrar('atalhos');
    CC.$('[data-aj-aba="atalhos"]', camada).focus();
  };

  document.addEventListener('click', (event) => { if (event.target.closest('[data-ajuda]')) D.abrirAjuda(); });
})(window.CC);
