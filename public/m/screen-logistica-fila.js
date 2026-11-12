// Assinatura de recibo da Logística: a fila guarda o PNG e a hora até a confirmação do servidor.
(function (CC) {
  CC.logistica = CC.logistica || {};
  CC.logistica.sendOp = async function (item) {
    if (item.op !== 'logistica-assinatura') throw new Error('Operação de Logística desconhecida.');
    await CC.api(`/logistica/entregas/${encodeURIComponent(item.reciboId)}/assinatura`, { method: 'PUT', body: item.body });
    const current = await CC.store.get('fila', item.client_id);
    if (current && current.criado_em === item.criado_em) await CC.store.del('fila', item.client_id);
  };
})(window.CC = window.CC || {});
