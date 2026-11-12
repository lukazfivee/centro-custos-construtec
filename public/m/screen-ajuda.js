// Menu › Ajuda (celular). Mesmo conteudo da Central de Ajuda do desktop (d/ajuda.js), em secoes que abrem e fecham:
// como lancar, regras, perfis da Suite, sobre e reportar um problema pelo assistente. So texto; nao le nem altera dados.
(function (CC) {
  const { esc, icon } = CC;
  const top = (title) => `<div class="top"><button class="back" type="button" id="voltar" aria-label="Voltar">${icon('caret-left', 20)}</button>
    <span class="grow"><h1>${esc(title)}</h1></span></div>`;

  const PAPEIS = [
    ['Administrador', 'Tudo, inclusive usuários e permissões, fechamento mensal, backup e restauração.'],
    ['Gestor', 'Painel, lançamentos (editar, excluir e estornar), cadastros, cobranças e autorização de envio, custo e BDI nos Orçamentos, horas e medições.'],
    ['Financeiro', 'Painel, lançar, editar, excluir e estornar lançamentos e acompanhar cobranças.'],
    ['Engenharia', 'Painel, lançar despesas, horas e medições, e custo e BDI nos Orçamentos, nas obras que lhe forem atribuídas.'],
    ['Técnico', 'Registra horas e medições, só nas obras atribuídas a ele.'],
    ['Comercial', 'Orçamentos: ver custo, BDI e margem, enviar e aprovar propostas.'],
  ];

  const sec = (id, titulo, corpo, aberta) => `<details class="card ajuda-sec"${aberta ? ' open' : ''} id="aj-${id}"><summary><b>${esc(titulo)}</b></summary><div class="ajuda-corpo">${corpo}</div></details>`;
  const par = (titulo, texto) => `<p><b>${esc(titulo)}.</b> ${texto}</p>`;

  CC.screens.ajuda = function (params) {
    const papel = CC.sv ? CC.sv.role() : '';
    const tecnico = papel === 'tecnico';
    const lancar = `<p>Toque em <b>Lançar</b> na barra de baixo, escolha a obra, informe valor, categoria e fornecedor e, se houver, tire a foto da nota. Sem internet, o lançamento fica guardado no celular e é enviado quando a conexão volta.</p>
      <p>O assistente também ajuda: pergunte como lançar uma despesa com foto ou peça para abrir uma tela.</p>`;
    const regras = [
      par('Lançamentos', 'Cada receita ou despesa tem <b>competência</b> (o mês a que pertence), <b>vencimento</b> e situação. Use <b>Pendente</b> enquanto não foi paga ou recebida; ao liquidar, mude para <b>Liquidado</b> e informe a data.'),
      par('Obras e orçamento', '<b>Comprometido</b> soma todas as despesas do mês, pagas ou pendentes; <b>Pago/recebido</b> considera só o que foi liquidado.'),
      par('Cobranças', 'Acompanham o recebimento de um serviço: nota fiscal, vencimento e pagamento.'),
      par('Fechamento mensal', 'Fechar o mês trava os lançamentos daquele período. Para corrigir um mês fechado, primeiro é preciso reabrir o fechamento; no mês aberto, edite ou estorne. Tudo fica no Histórico.'),
    ].join('');
    const perfis = `${PAPEIS.map(([nome, texto]) => `<p><b>${esc(nome)}.</b> ${esc(texto)}</p>`).join('')}
      <p class="muted">É o padrão de cada perfil; em contas corporativas o administrador ajusta as permissões em Usuários, no computador. O que você não pode usar não aparece.</p>`;
    const sobre = `<p><b>Aplicativo.</b> Centro de Custos Construtec</p>
      <p><b>Onde roda.</b> ${/SuiteConstrutec/.test(navigator.userAgent) ? 'Aplicativo da Suíte' : 'Site da Suíte no navegador'}</p>
      <p><b>Empresa.</b> LAC Construtec Construtora Eireli</p>`;
    const reportar = `<p>Encontrou algo errado? Conte ao assistente o que aconteceu: ele monta o relato e envia para o suporte.</p>
      ${CC.ia && CC.ia.ready && CC.ia.ready() ? `<button class="btn2" type="button" id="aj-reportar" style="width:100%">${icon('bug', 20)}<span>Reportar com o assistente</span></button>` : '<p class="muted">O assistente não está disponível agora.</p>'}`;
    const el = CC.render(`${top('Ajuda')}
      <div class="ajuda-lista">
        ${tecnico ? '' : sec('lancar', 'Como lançar uma despesa', lancar, true)}
        ${sec('regras', 'Regras de lançamento e fechamento', regras, tecnico)}
        ${sec('perfis', 'Perfis de acesso', perfis)}
        ${sec('sobre', 'Sobre', sobre)}
        ${sec('reportar', 'Reportar problema', reportar)}
      </div>`, true, params);
    CC.$('#voltar', el).addEventListener('click', () => CC.go('menu'));
    const bt = CC.$('#aj-reportar', el);
    if (bt) bt.addEventListener('click', () => CC.ia.open('Quero reportar um problema no app.'));
  };
})(window.CC = window.CC || {});
