// Cobrancas no celular: regras de situacao, andamento em 4 passos e indicadores.
// Mesmas regras do desktop (public/d/telas/cobrancas-regras.js). Valores vem do Worker em reais;
// as somas usam centavos com HALF_UP. Uma cobranca por obra.
(function (CC) {
  const { esc, icon } = CC;
  const B = CC.cobr = CC.cobr || {};

  // Data de hoje em Brasilia (AAAA-MM-DD): "vencida" nao depende do fuso do celular.
  B.hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  B.cents = (x) => Math.round(CC.cents(x) * 100);
  B.reais = (c) => c / 100;
  B.pago = (i) => i.financialStatus === 'pago';
  B.vencida = (i) => !B.pago(i) && !!i.dueDate && i.dueDate < B.hoje();
  B.aprovada = (i) => i.operationalStatus !== 'em_execucao';
  B.pendente = (i) => ['a_faturar', 'nf_emitida'].includes(i.financialStatus);
  B.aguardando = (i) => ['enviada', 'aguardando_pagamento'].includes(i.financialStatus) && !B.vencida(i);
  B.sensivel = (i) => ['pago', 'enviada'].includes(i.financialStatus);
  B.cliente = (i) => i.clientName || i.client || '';
  B.url = (i, acao) => `/cloud-sync/cobrancas/${encodeURIComponent(i.publicId)}${acao ? `/${acao}` : ''}`;

  B.OP = [['em_execucao', 'Aguardando aprovação'], ['finalizada', 'Medição aprovada'], ['entregue', 'Obra concluída']];
  B.FIN = [['a_faturar', 'A faturar'], ['nf_emitida', 'NF emitida'], ['enviada', 'E-mail enviado'], ['aguardando_pagamento', 'Aguardando pagamento'], ['pago', 'Paga']];
  B.textoOp = (i) => (B.OP.find(([k]) => k === i.operationalStatus) || B.OP[0])[1];
  // [texto, tom] da situacao financeira: ok, warn, err ou neutro.
  B.fin = (i) => {
    if (B.pago(i)) return ['Paga', 'ok'];
    if (B.vencida(i)) return ['Vencida', 'err'];
    const mapa = { aguardando_pagamento: ['Aguardando pagamento', 'neutro'], enviada: ['E-mail enviado', 'neutro'], nf_emitida: ['NF emitida', 'neutro'],
      a_faturar: B.aprovada(i) ? ['NF a emitir', 'warn'] : ['Pendente', 'neutro'] };
    return mapa[i.financialStatus] || mapa.a_faturar;
  };
  B.textoFin = (i) => B.fin(i)[0];
  B.tag = (i) => { const [t, tom] = B.fin(i); return `<span class="tag fin-${tom}">${esc(t)}</span>`; };

  // Os 4 passos: medicao aprovada, NF emitida, e-mail enviado, pagamento. "atual" e o primeiro que falta.
  B.passos = (i) => {
    const fin = ['a_faturar', 'nf_emitida', 'enviada', 'aguardando_pagamento', 'pago'].indexOf(i.financialStatus);
    const feitos = [B.aprovada(i), fin >= 1, fin >= 2, fin >= 4];
    const atual = feitos.indexOf(false);
    const venc = B.vencida(i);
    const detalhes = [
      feitos[0] ? (i.completionDate ? `Concluída em ${CC.dateFull(i.completionDate)}` : 'Aprovada') : 'Aguardando aprovação do cliente',
      feitos[1] ? (i.invoiceNumber || 'Nota fiscal emitida') : 'Falta emitir a NF',
      feitos[2] ? 'E-mail enviado ao cliente' : 'Falta enviar o e-mail',
      feitos[3] ? 'Pagamento registrado' : (venc ? `Venceu em ${CC.dateFull(i.dueDate)} · cobrar de novo` : (i.dueDate ? `Vence em ${CC.dateFull(i.dueDate)}` : 'Sem vencimento definido')),
    ];
    const titulos = ['Medição aprovada pelo cliente', 'NF emitida', 'E-mail enviado ao cliente', 'Pagamento recebido'];
    return titulos.map((titulo, n) => ({ titulo, detalhe: detalhes[n], feito: feitos[n], atual: n === atual, vencido: n === 3 && venc && !feitos[3] }));
  };
  B.passosHtml = (i) => `<ol class="fin-passos">${B.passos(i).map((p) => `<li class="${p.feito ? 'feito' : ''}${p.atual ? ' atual' : ''}${p.vencido ? ' vencido' : ''}">
    <span class="dot">${p.feito ? icon('check', 13) : ''}</span><span><b>${esc(p.titulo)}</b><small>${esc(p.detalhe)}</small></span></li>`).join('')}</ol>`;

  // Proximo passo conforme o estado (texto e acao do botao).
  B.proximo = (i) => {
    const n = B.passos(i).findIndex((p) => p.atual);
    if (B.pago(i)) return { texto: 'Cobrança paga. Nada a fazer.', acao: null };
    if (n === 0) return { texto: 'Marcar a medição como aprovada para poder cobrar', acao: 'aprovar', rotulo: 'Marcar aprovada', icone: 'check-circle' };
    if (n === 1) return { texto: 'Emitir a NF para poder cobrar', acao: 'nf', rotulo: 'Emitir NF', icone: 'file-text' };
    if (n === 2) return { texto: 'Preparar o e-mail de cobrança ao cliente', acao: 'email', rotulo: 'Preparar e-mail', icone: 'envelope-simple' };
    return { texto: B.vencida(i) ? 'Cobrança vencida: reenviar ou registrar pagamento' : 'Aguardando o pagamento do cliente', acao: 'pagar', rotulo: 'Registrar pagamento', icone: 'check' };
  };

  B.filtrar = (itens, filtro, busca) => {
    const q = String(busca || '').trim().toLowerCase();
    return itens.filter((i) => {
      if (q && ![i.code, i.name, i.clientName, i.client, i.invoiceNumber].join(' ').toLowerCase().includes(q)) return false;
      if (filtro === 'pendentes') return !B.pago(i) && B.pendente(i);
      if (filtro === 'aguardando') return B.aguardando(i);
      if (filtro === 'vencidas') return B.vencida(i);
      if (filtro === 'pagas') return B.pago(i);
      return true;
    });
  };

  // Indicadores em centavos.
  B.indicadores = (itens) => {
    const soma = (lista) => lista.reduce((s, i) => s + B.cents(i.receivableAmount), 0);
    const pagas = itens.filter(B.pago);
    const aguard = itens.filter((i) => i.financialStatus === 'aguardando_pagamento');
    return {
      finalizadas: soma(pagas), qtdPagas: pagas.length, aguardando: soma(aguard), venceramEntre: aguard.filter(B.vencida).length,
      pendentes: itens.filter((i) => !B.pago(i) && B.pendente(i)).length, aReceber: soma(itens.filter((i) => !B.pago(i))),
    };
  };

  // Corpo do PUT /cloud-sync/cobrancas/:id: o registro inteiro com as mudancas por cima.
  B.corpo = (i, mudancas) => ({
    clientName: i.clientName || '', clientEmails: i.clientEmails || [], responsible: i.responsible || '',
    operationalStatus: i.operationalStatus, financialStatus: i.financialStatus, invoiceNumber: i.invoiceNumber || '',
    contractAmount: Number(i.contractAmount || 0), receivableAmount: Number(i.receivableAmount || 0),
    completionDate: i.completionDate || null, dueDate: i.dueDate || null, notes: i.notes || '', ...mudancas,
  });
  B.salvar = async (i, mudancas) => {
    await CC.api(B.url(i), { method: 'PUT', body: B.corpo(i, mudancas) });
    Object.assign(i, mudancas);
  };

  B.csv = (itens) => {
    const cel = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const linhas = [['Obra', 'Cliente', 'Situação operacional', 'Situação financeira', 'NF', 'Vencimento', 'Valor a receber']];
    itens.forEach((i) => linhas.push([`${i.code} ${i.name}`, B.cliente(i), B.textoOp(i), B.textoFin(i), i.invoiceNumber, CC.dateFull(i.dueDate),
      Number(i.receivableAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })]));
    return `﻿${linhas.map((l) => l.map(cel).join(';')).join('\r\n')}`;
  };

  // Lista em memoria (a ultima carregada), para o detalhe abrir sem buscar de novo.
  B.lista = [];
  B.excluidas = [];
  B.carregar = async () => {
    const { data } = await CC.api('/cloud-sync/cobrancas');
    B.lista = Array.isArray(data.items) ? data.items : [];
    return B.lista;
  };
  B.carregarExcluidas = async () => {
    const { data } = await CC.api('/cloud-sync/cobrancas?excluidas=1');
    B.excluidas = Array.isArray(data.items) ? data.items : [];
    return B.excluidas;
  };
  B.achar = (id) => B.lista.find((i) => i.publicId === id) || null;
  B.semNuvem = (error) => (error && error.status === 0 ? 'Sem internet. As cobranças voltam quando a conexão voltar.' : (error && error.message) || 'Não foi possível carregar as cobranças.');
})(window.CC = window.CC || {});
