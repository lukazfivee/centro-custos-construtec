// Pedido de materiais por técnico, limitado às obras e serviços atribuídos no servidor.
(function (CC) {
  const { esc, icon } = CC;
  CC.screens['meus-materiais'] = async function (params) {
    const el = CC.render(`${CC.header('')}<h1 class="title">Materiais</h1><div class="skeleton"></div>`, false, params);
    try {
      const [{ data: options }, { data: requests }] = await Promise.all([
        CC.api('/logistica/materiais/opcoes-tecnico'), CC.api('/logistica/materiais/minhas-solicitacoes'),
      ]);
      if (params && params.__nav !== CC.nav) return;
      const centers = options.centros.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.kind === 'servico' ? 'Serviço' : 'Obra')}</option>`).join('');
      const materials = options.materiais.map((m) => `<option value="${m.id}">${esc(m.nome)} (${esc(m.unidade)})</option>`).join('');
      const list = requests.map((r) => `<article class="card lgm-item"><b>${esc(r.material)} · ${esc(r.status)}</b><span>${esc(r.entregue)} de ${esc(r.solicitada)} ${esc(r.unidade)} · ${esc(r.centro)}</span>${['solicitada','parcial'].includes(r.status) ? `<button class="btn2" type="button" data-cancelar="${r.id}">Cancelar pedido</button>` : ''}</article>`).join('');
      el.innerHTML = `${CC.header('')}<h1 class="title">Materiais para serviço</h1><p class="sub">Peça materiais para uma obra ou serviço atribuído a você.</p>
        <form class="card lgm-form" id="lm-form"><label>Obra ou serviço<select class="inp" name="centroId" required>${centers}</select></label>
        <label>Material<select class="inp" name="materialId" required>${materials}</select></label>
        <label>Quantidade<input class="inp" name="quantidade" type="number" min="0.001" step="0.001" required></label>
        <label>Observação (opcional)<input class="inp" name="observacao" maxlength="500"></label>
        <button class="btn lgm-full" type="submit">${icon('package', 18)}Solicitar material</button></form>
        <h2 class="label">Minhas solicitações</h2><div class="lgm-list">${list || '<p class="sub">Nenhum pedido de material.</p>'}</div>`;
      CC.$('#lm-form', el).addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget), quantity = Number(form.get('quantidade'));
        if (!(quantity > 0)) return CC.toast('Informe uma quantidade maior que zero');
        const body = { centroId: Number(form.get('centroId')), materialId: Number(form.get('materialId')),
          quantidade: quantity, observacao: String(form.get('observacao') || ''), client_id: CC.uuid() };
        try {
          await CC.queue.add({ client_id: body.client_id, op: 'logistica-solicitacao', rotulo: 'Pedido de material', body });
          CC.toast(CC.offline() ? 'Pedido salvo no celular para envio' : 'Pedido enviado à Logística');
          if (!CC.offline()) CC.go('meus-materiais');
        } catch (error) { CC.toast(error.message || 'Não foi possível solicitar o material'); }
      });
      CC.$$('[data-cancelar]', el).forEach((button) => button.addEventListener('click', async () => {
        const motivo = prompt('Motivo do cancelamento:'); if (!motivo || motivo.trim().length < 3) return;
        try { await CC.api(`/logistica/materiais/solicitacoes/${button.dataset.cancelar}/cancelar`, { method: 'POST', body: { motivo } }); CC.go('meus-materiais'); }
        catch (error) { CC.toast(error.message || 'Não foi possível cancelar o pedido'); }
      }));
    } catch (error) { CC.errorScreen(el, error, () => CC.go('meus-materiais')); }
  };
})(window.CC = window.CC || {});
