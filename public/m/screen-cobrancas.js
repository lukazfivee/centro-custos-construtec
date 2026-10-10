// Menu › Cobrancas: indicadores, filtros, busca, lista por obra e a aba Excluidas (restaurar).
// Dados: GET /api/cloud-sync/cobrancas (o mesmo do desktop, public/d/telas/cobrancas.js).
// So para conta @rcconstrutec.com.br com p6 (CC.fin.podeCobrancas); o servidor confere de novo.
(function (CC) {
  const { esc, icon, money } = CC;
  const B = CC.cobr;
  const F = CC.fin;
  const FILTROS = [['', 'Todas'], ['pendentes', 'Pendentes'], ['aguardando', 'Aguardando'], ['vencidas', 'Vencidas'], ['pagas', 'Pagas'], ['excluidas', 'Excluídas']];
  let estado = { filtro: '', busca: '' };

  function indicadores(itens) {
    const ind = B.indicadores(itens);
    return `<div class="card fin-kpi"><span class="label">A receber</span><b class="big">${esc(money(B.reais(ind.aReceber)))}</b>
      <div class="fin-kpi3"><span><small>Pagas</small><b>${esc(money(B.reais(ind.finalizadas)))}</b><small>${esc(F.plural(ind.qtdPagas, 'cobrança', 'cobranças'))}</small></span>
        <span><small>Aguardando</small><b>${esc(money(B.reais(ind.aguardando)))}</b><small>${ind.venceramEntre ? esc(`${ind.venceramEntre} vencida(s)`) : 'nenhuma vencida'}</small></span>
        <span><small>Pendentes</small><b class="${ind.pendentes ? 'warn-txt' : ''}">${esc(String(ind.pendentes))}</b><small>NF ou envio</small></span></div></div>`;
  }

  const linha = (i) => `<button type="button" class="row fin-row" data-cob="${esc(i.publicId)}">
    <span class="line"><span class="grow name">${esc(i.name)}</span>${B.tag(i)}</span>
    <span class="cli">${esc([i.code, B.cliente(i)].filter(Boolean).join(' · '))}</span>
    <span class="line foot"><span class="grow">${esc(i.invoiceNumber ? `NF ${i.invoiceNumber}` : 'Sem NF')}${i.dueDate ? ` · <span class="${B.vencida(i) ? 'warn-txt' : ''}">vence ${esc(CC.dateFull(i.dueDate))}</span>` : ''}</span>
      <b class="fin-val">${esc(money(i.receivableAmount))}</b></span></button>`;

  const linhaExcluida = (i) => `<div class="row fin-row">
    <span class="line"><span class="grow name">${esc(i.name)}</span>${B.tag(i)}</span>
    <span class="cli">${esc([i.code, B.cliente(i), money(i.receivableAmount)].filter(Boolean).join(' · '))}</span>
    <span class="foot">${esc(['Excluída', i.deletedAt ? `em ${CC.dateFull(String(i.deletedAt).slice(0, 10))}` : '', i.deletedByEmail ? `por ${i.deletedByEmail}` : ''].filter(Boolean).join(' '))}${i.deletedReason ? ` · ${esc(i.deletedReason)}` : ''}</span>
    <button class="btn2" type="button" data-restaurar="${esc(i.publicId)}">${icon('arrow-counter-clockwise', 18)}Restaurar</button></div>`;

  CC.screens.cobrancas = async function (params) {
    if (params && params.filtro !== undefined) estado.filtro = params.filtro;
    const voltar = () => CC.go('menu');
    const csvBtn = `<button class="back" type="button" id="cob-csv" aria-label="Baixar ou compartilhar CSV">${icon('download-simple', 22)}</button>`;
    const el = CC.render(`${F.top('Cobranças', 'Carregando…', csvBtn)}<div class="skeleton"></div><div class="skeleton"></div>`, true, params);
    F.voltar(el, voltar);
    await F.perms();
    if (!F.podeCobrancas()) {
      const page = CC.render(`${F.top('Cobranças')}<div class="empty">${icon('lock-simple', 28)}Cobranças ficam só para contas @rcconstrutec.com.br com acesso ao financeiro.</div>`, true, params);
      return F.voltar(page, voltar);
    }
    try {
      await B.carregar();
      if (estado.filtro === 'excluidas') await B.carregarExcluidas();
    } catch (error) {
      const page = CC.render(`${F.top('Cobranças')}<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 28)}${esc(B.semNuvem(error))}
        <button class="btn2" type="button" id="retry" style="padding:0 18px">Tentar de novo</button></div>`, true, params);
      F.voltar(page, voltar);
      return CC.$('#retry', page).addEventListener('click', () => CC.screens.cobrancas(params));
    }
    const mes = CC.mesNome(CC.month()).toLowerCase();
    const page = CC.render(`${F.top('Cobranças', `${F.plural(B.lista.length, 'obra', 'obras')} na cobrança · ${mes}`, csvBtn)}
      ${indicadores(B.lista)}
      ${F.busca('cob-busca', estado.busca, 'Obra, cliente ou NF')}
      <div class="chips" role="group" aria-label="Situação da cobrança">${FILTROS.map(([k, l]) => `<button class="chip-act" type="button" data-filtro="${k}" aria-pressed="${k === estado.filtro}">${l}</button>`).join('')}</div>
      <div id="cob-lista"></div>`, true, params);
    F.voltar(page, voltar);
    const pintar = () => {
      const slot = CC.$('#cob-lista', page);
      if (estado.filtro === 'excluidas') {
        const vis = B.filtrar(B.excluidas, '', estado.busca);
        slot.innerHTML = vis.length ? `<div class="rows">${vis.map(linhaExcluida).join('')}</div><p class="sub fin-rodape">${esc(`${vis.length} de ${F.plural(B.excluidas.length, 'cobrança excluída', 'cobranças excluídas')}`)}</p>`
          : `<div class="empty">${icon('archive', 28)}${B.excluidas.length ? 'Nenhuma cobrança excluída com essa busca.' : 'Nenhuma cobrança excluída. O que você excluir aparece aqui para restaurar.'}</div>`;
        CC.$$('[data-restaurar]', slot).forEach((b) => b.addEventListener('click', () => restaurar(b, params)));
        return;
      }
      const vis = B.filtrar(B.lista, estado.filtro, estado.busca);
      const abertas = vis.filter((i) => !B.pago(i)).reduce((s, i) => s + B.cents(i.receivableAmount), 0);
      slot.innerHTML = vis.length ? `<div class="kv lanc-total"><span>${esc(`${vis.length} de ${B.lista.length}`)} · em aberto</span><b>${esc(money(B.reais(abertas)))}</b></div>
        <div class="rows">${vis.map(linha).join('')}</div>` : `<div class="empty">${icon('envelope-simple', 28)}Nenhuma cobrança com esses filtros.</div>`;
      CC.$$('[data-cob]', slot).forEach((b) => b.addEventListener('click', () => CC.go('cobranca', { id: b.dataset.cob })));
    };
    F.ligarBusca(page, 'cob-busca', (texto) => { estado.busca = texto; pintar(); });
    CC.$$('[data-filtro]', page).forEach((b) => b.addEventListener('click', async () => {
      estado.filtro = b.dataset.filtro;
      CC.$$('[data-filtro]', page).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (estado.filtro === 'excluidas') {
        CC.$('#cob-lista', page).innerHTML = '<div class="skeleton"></div>';
        try { await B.carregarExcluidas(); } catch (error) {
          CC.$('#cob-lista', page).innerHTML = `<div class="empty">${icon('warning-circle', 28)}${esc(B.semNuvem(error))}</div>`;
          return;
        }
      }
      pintar();
    }));
    CC.$('#cob-csv', page).addEventListener('click', () => {
      const lista = estado.filtro === 'excluidas' ? B.filtrar(B.excluidas, '', estado.busca) : B.filtrar(B.lista, estado.filtro, estado.busca);
      F.compartilharCsv(B.csv(lista), 'cobrancas.csv');
    });
    pintar();
    return undefined;
  };

  async function restaurar(b, params) {
    CC.busy(b, 'Restaurando…');
    try { await CC.api(B.url({ publicId: b.dataset.restaurar }, 'restaurar'), { method: 'POST', body: {} }); } catch (error) {
      CC.toast(error.status === 0 ? 'Sem internet. Restaurar precisa da conexão.' : error.message, 'warning-circle');
      return F.solta(b, 'arrow-counter-clockwise', 'Restaurar');
    }
    CC.toast('Cobrança restaurada');
    return CC.screens.cobrancas(params);
  }
})(window.CC = window.CC || {});
