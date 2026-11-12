// Fechamento mensal no celular (so p8, como no desktop public/d/telas/fechamento*.js): resumo do ano,
// checklist "Antes de fechar", fechar registrando as pendencias e reabrir com motivo. Rotas em
// routes/monthlyClosing.js; o servidor confere a permissao e recusa fechar o mesmo mes duas vezes.
(function (CC) {
  const { esc, icon, money } = CC;
  const A = CC.adm;
  const MOTIVO_MINIMO = 10;
  const ICONE = { pendente: ['warning-circle', 'warn'], ok: ['check-circle', 'ok'], info: ['info', 'info'], indisponivel: ['cloud-slash', 'mudo'] };
  const NOTA = 'Pendências não impedem o fechamento, mas ficam registradas. Reabrir pede um motivo e vai para o Histórico.';

  const chave = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`;
  const nomeMes = (ano, mes) => CC.mesNome(chave(ano, mes)).split(' de ')[0];
  const nomeLongo = (ano, mes) => CC.mesNome(chave(ano, mes)).toLowerCase();

  // Mes que abre: o atual, ou o anterior se ainda for comeco do mes e ele nao foi fechado.
  function escolher(meses, ano) {
    const [anoHoje, mesHoje] = CC.month().split('-').map(Number);
    if (ano !== anoHoje) return (meses.filter((m) => m.lancamentos).pop() || meses[11]).mes;
    const anterior = meses[mesHoje - 2];
    return Number(CC.today().slice(8, 10)) <= 10 && anterior && !anterior.fechado && anterior.lancamentos ? anterior.mes : mesHoje;
  }
  // Atual primeiro, depois os anteriores do mais novo ao mais antigo e por fim os futuros.
  function ordenar(meses, ano) {
    const [anoHoje, mesHoje] = CC.month().split('-').map(Number);
    const pos = (m) => (ano < anoHoje || (ano === anoHoje && m.mes < mesHoje) ? 1 : (ano === anoHoje && m.mes === mesHoje ? 0 : 2));
    return [...meses].sort((a, b) => pos(a) - pos(b) || (pos(a) === 2 ? a.mes - b.mes : b.mes - a.mes));
  }
  const futuro = (ano, mes) => { const [a, m] = CC.month().split('-').map(Number); return ano > a || (ano === a && mes > m); };
  const tag = (m, ano) => (m.fechado ? `<span class="tag">${icon('lock-simple', 12)}Fechado</span>`
    : (futuro(ano, m.mes) ? '<span class="tag">Futuro</span>' : '<span class="tag ok">Aberto</span>'));
  const reaberto = (m) => (m.reaberto ? `<small class="adm-reab">Reaberto em ${esc(A.dia(m.reaberto.em))}${m.reaberto.motivo ? `: ${esc(m.reaberto.motivo)}` : ''}</small>` : '');

  // Checklist do servidor mais a fila deste celular (lancamentos esperando internet).
  async function checklist(ano, mes) {
    const { data } = await CC.api(`/fechamento-mensal/checklist?ano=${ano}&mes=${mes}`);
    const fila = CC.queue && CC.queue.mine ? (await CC.queue.mine()).length : 0;
    const item = fila > 0
      ? { chave: 'fila', situacao: 'pendente', quantidade: fila, titulo: A.plural(fila, 'lançamento na fila deste celular', 'lançamentos na fila deste celular'), detalhe: 'Esperando internet para ser enviado. Envie antes de fechar.' }
      : { chave: 'fila', situacao: 'ok', quantidade: 0, titulo: 'Fila deste celular vazia', detalhe: 'Nenhum lançamento esperando internet neste celular.' };
    const itens = [...data.itens];
    itens.splice(3, 0, item);
    return { ...data, itens, total_pendencias: itens.filter((i) => i.situacao === 'pendente').length };
  }
  const pendenciasDe = (lista) => lista.itens.filter((i) => i.situacao === 'pendente')
    .map(({ chave: k, titulo, quantidade, valor, detalhe }) => ({ chave: k, titulo, quantidade, ...(valor == null ? {} : { valor }), detalhe }));

  // "Ver" leva para a lista ja filtrada, quando o celular tem a tela.
  function destino(k, ano, mes) {
    const comp = chave(ano, mes);
    if (k === 'vencidas') return ['lancamentos', { mes: comp, tipo: 'despesa', situacao: 'vencido', busca: '' }];
    if (k === 'em_aberto') return ['lancamentos', { mes: comp, tipo: '', situacao: 'pendente', busca: '' }];
    if (k === 'fila') return ['lancamentos', { mes: CC.month(), tipo: '', situacao: '', busca: '' }];
    if (k === 'cobrancas' && CC.screens.cobrancas) return ['cobrancas'];
    if (k === 'recorrentes' && CC.screens.recorrentes) return ['recorrentes'];
    return null;
  }
  function linhaCk(item, ano, mes, semVer) {
    const [ic, tom] = ICONE[item.situacao] || ICONE.ok;
    const ver = !semVer && item.situacao !== 'ok' && destino(item.chave, ano, mes);
    return `<li class="adm-ck-item"><span class="adm-ck-ic ${tom}">${icon(ic, 18)}</span>
      <span class="grow"><b>${esc(item.titulo)}</b>${item.detalhe ? `<small>${esc(item.detalhe)}</small>` : ''}</span>
      ${ver ? `<button class="chip-act" type="button" data-ver="${esc(item.chave)}">Ver</button>` : ''}</li>`;
  }
  function ligarVer(box, ano, mes) {
    CC.$$('[data-ver]', box).forEach((b) => b.addEventListener('click', () => { const d = destino(b.dataset.ver, ano, mes); if (d) CC.go(d[0], d[1]); }));
  }

  async function painelChecklist(box, ano, mes) {
    box.innerHTML = '<div class="skeleton"></div>';
    let lista;
    try { lista = await checklist(ano, mes); } catch (error) {
      if (box.isConnected) box.innerHTML = `<p class="sub adm-sub">${esc(A.erroTexto(error, 'O checklist'))}</p>`;
      return;
    }
    if (!box.isConnected) return;
    const n = lista.total_pendencias;
    box.innerHTML = `<div class="adm-head"><span class="label">Antes de fechar ${esc(nomeMes(ano, mes).toLowerCase())}</span><span class="tag${n ? ' warn' : ' ok'}">${n ? A.plural(n, 'pendência', 'pendências') : 'Tudo certo'}</span></div>
      <ul class="adm-ck">${lista.itens.map((i) => linhaCk(i, ano, mes)).join('')}</ul><p class="adm-nota">${esc(NOTA)}</p>`;
    ligarVer(box, ano, mes);
  }
  function painelRegistrado(box, m) {
    const lista = m.pendencias || [];
    const itens = lista.length ? lista.map((p) => linhaCk({ chave: p.chave, situacao: 'pendente', titulo: p.titulo, detalhe: p.detalhe }, m.ano, m.mes)).join('')
      : linhaCk({ chave: 'nenhuma', situacao: 'ok', titulo: 'Fechado sem pendências registradas', detalhe: 'Nada ficou em aberto no checklist quando o mês foi fechado.' });
    box.innerHTML = `<div class="adm-head"><span class="label">Registrado no fechamento</span>${lista.length ? `<span class="tag warn">${A.plural(lista.length, 'pendência', 'pendências')}</span>` : ''}</div>
      <ul class="adm-ck">${itens}</ul><p class="adm-nota">${esc(NOTA)}</p>`;
    ligarVer(box, m.ano, m.mes);
  }

  // Confirma o fechamento listando as pendencias (conferidas de novo agora).
  async function fechar(ano, mes, pronto) {
    const titulo = `Fechar ${nomeLongo(ano, mes)}?`;
    const sh = CC.sheet('adm-fech', `${CC.sheetHead('lock-simple', titulo)}<div class="skeleton"></div>`);
    let lista;
    try { lista = await checklist(ano, mes); } catch (error) {
      if (document.body.contains(sh.el)) sh.set(`${CC.sheetHead('lock-simple', titulo)}${CC.sheetErr(error)}`);
      return;
    }
    if (!document.body.contains(sh.el)) return;
    const pend = pendenciasDe(lista);
    const form = (err) => {
      sh.set(`${CC.sheetHead('lock-simple', titulo)}
        <p class="od-txt">${pend.length ? `Ainda há ${A.plural(pend.length, 'pendência', 'pendências')}. Dá para fechar mesmo assim; elas ficam registradas no fechamento e no Histórico.` : 'Tudo certo no checklist.'} Depois de fechar, ninguém edita, exclui ou estorna lançamentos deste mês sem reabrir.</p>
        ${pend.length ? `<ul class="adm-ck">${pend.map((p) => linhaCk({ ...p, situacao: 'pendente' }, ano, mes, true)).join('')}</ul>` : ''}
        ${err ? CC.sheetErr(err) : ''}
        <div class="grid2 od-acts"><button class="btn2" type="button" id="fc-cancel">Cancelar</button>
          <button class="btn" type="button" id="fc-go">${icon('lock-simple', 18)}${pend.length ? 'Fechar assim' : 'Fechar mês'}</button></div>`);
      CC.$('#fc-cancel', sh.el).addEventListener('click', sh.close);
      CC.$('#fc-go', sh.el).addEventListener('click', async (e) => {
        CC.busy(e.currentTarget, 'Fechando…');
        try { await CC.api('/fechamento-mensal', { method: 'POST', body: { ano, mes, pendencias: pend } }); } catch (error) { return form(error); }
        sh.close();
        CC.toast(`${nomeMes(ano, mes)} de ${ano} fechado`);
        pronto();
        return undefined;
      });
    };
    form();
  }

  function reabrir(m, pronto) {
    const titulo = `Reabrir ${nomeLongo(m.ano, m.mes)}?`;
    const form = (err, texto) => {
      const sh = CC.sheet('adm-fech', `${CC.sheetHead('lock-simple', titulo)}
        <p class="od-txt">Os lançamentos do mês voltam a ser editáveis até alguém fechar de novo. O motivo fica no Histórico e aparece na lista de competências.</p>
        <label class="field"><span>Motivo da reabertura</span><textarea id="fc-motivo" rows="3" maxlength="500" placeholder="Ex.: NF de agosto chegou depois do fechamento">${esc(texto || '')}</textarea></label>
        <p class="alert" role="alert" id="fc-erro"></p>
        ${err ? CC.sheetErr(err) : ''}
        <div class="grid2 od-acts"><button class="btn2" type="button" id="fc-cancel">Cancelar</button>
          <button class="btn" type="button" id="fc-go">Reabrir o mês</button></div>`);
      CC.$('#fc-cancel', sh.el).addEventListener('click', sh.close);
      CC.$('#fc-go', sh.el).addEventListener('click', async (e) => {
        const motivo = CC.$('#fc-motivo', sh.el).value.trim();
        if (motivo.length < MOTIVO_MINIMO) { CC.$('#fc-erro', sh.el).textContent = `Conte o motivo com pelo menos ${MOTIVO_MINIMO} caracteres.`; return; }
        CC.busy(e.currentTarget, 'Reabrindo…');
        try { await CC.api(`/fechamento-mensal/${m.fechamento_id}`, { method: 'DELETE', body: { motivo } }); } catch (error) { form(error, motivo); return; }
        sh.close();
        CC.toast(`${nomeMes(m.ano, m.mes)} de ${m.ano} reaberto`);
        pronto();
      });
    };
    form();
  }

  CC.screens.fechamento = async function (params) {
    if (!(await A.guard(params, 'p8', 'Fechamento mensal'))) return;
    const anoHoje = Number(CC.month().slice(0, 4));
    const ano = Number(params.ano) || anoHoje;
    const topo = A.top('Fechamento mensal', 'Mês fechado fica travado para edição');
    A.voltar(CC.render(`${topo}<div class="skeleton"></div><div class="skeleton"></div>`, true, params));
    let meses;
    try { meses = (await CC.api(`/fechamento-mensal/resumo?ano=${ano}`)).data.meses; } catch (error) {
      const el = CC.render(`${topo}<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 28)}${esc(A.erroTexto(error, 'O fechamento'))}
        <button class="btn2" type="button" id="retry" style="padding:0 18px">Tentar de novo</button></div>`, true, params);
      A.voltar(el);
      CC.$('#retry', el).addEventListener('click', () => CC.screens.fechamento(params));
      return;
    }
    const mes = Number(params.mes) || escolher(meses, ano);
    const m = meses[mes - 1];
    const fut = futuro(ano, mes);
    const fechados = meses.filter((x) => x.fechado).length;
    const anos = [anoHoje - 2, anoHoje - 1, anoHoje];
    const acao = m.fechado ? `<button class="btn2" type="button" id="fc-reabrir">${icon('lock-simple', 18)}Reabrir ${esc(nomeMes(ano, mes).toLowerCase())}</button>`
      : (fut ? '' : `<button class="btn" type="button" id="fc-fechar">${icon('lock-simple', 18)}Fechar ${esc(nomeLongo(ano, mes))}</button>`);
    const linhas = ordenar(meses, ano).map((x) => `<button class="adm-row${x.mes === mes ? ' sel' : ''}" type="button" data-mes="${x.mes}"${x.mes === mes ? ' aria-current="true"' : ''}>
        <span class="grow"><b>${esc(nomeMes(ano, x.mes))}</b><small>${x.fechado ? `Por ${esc(x.fechado_por)} em ${esc(A.dia(x.fechado_em))}${x.pendencias.length ? ` · ${A.plural(x.pendencias.length, 'pendência', 'pendências')}` : ''}` : esc(A.plural(x.lancamentos, 'lançamento', 'lançamentos'))}</small>${reaberto(x)}</span>
        <span class="adm-row-end">${tag(x, ano)}<small>${x.lancamentos ? esc(money(x.resultado)) : '—'}</small></span></button>`).join('');
    const el = CC.render(`${topo}
      <div class="seg" role="group" aria-label="Ano">${anos.map((a) => `<button type="button" data-ano="${a}" aria-pressed="${a === ano}">${a}</button>`).join('')}</div>
      <div class="card"><div class="adm-head"><b class="adm-mes">${esc(CC.mesNome(chave(ano, mes)))}</b>${tag(m, ano)}</div>
        <div class="kv"><span>Receitas</span><b>${esc(money(m.receitas))}</b></div>
        <div class="kv"><span>Despesas</span><b>${esc(money(m.despesas))}</b></div>
        <div class="kv"><span>Resultado</span><b class="${m.resultado < 0 ? 'warn-txt' : ''}">${esc(money(m.resultado))}</b></div>
        <div class="kv"><span>Em aberto</span><b>${m.em_aberto ? `${m.em_aberto} · ${esc(money(m.valor_em_aberto))}` : 'Nada a pagar ou a receber'}</b></div>
        ${m.fechado ? `<p class="adm-nota">${icon('lock-simple', 14)}Fechado por ${esc(m.fechado_por)} em ${esc(A.quando(m.fechado_em))}</p>` : ''}${reaberto(m)}</div>
      ${acao}
      <div class="card" id="fc-ck">${fut ? `<div class="empty">${icon('calendar-blank', 26)}<b>Competência futura</b>O checklist aparece quando o mês começar.</div>` : ''}</div>
      <p class="sheet-sec">Competências de ${ano} · ${A.plural(fechados, 'fechada', 'fechadas')}</p>
      <div class="card adm-lista">${linhas}</div>`, true, params);
    A.voltar(el);
    const recarregar = (mudar) => CC.screens.fechamento({ ...params, ano, mes, ...(mudar || {}) });
    CC.$$('[data-ano]', el).forEach((b) => b.addEventListener('click', () => { if (Number(b.dataset.ano) !== ano) recarregar({ ano: Number(b.dataset.ano), mes: 0 }); }));
    CC.$$('[data-mes]', el).forEach((b) => b.addEventListener('click', () => { if (Number(b.dataset.mes) !== mes) recarregar({ mes: Number(b.dataset.mes) }); }));
    const bf = CC.$('#fc-fechar', el);
    if (bf) bf.addEventListener('click', () => fechar(ano, mes, () => recarregar()));
    const br = CC.$('#fc-reabrir', el);
    if (br) br.addEventListener('click', () => reabrir(m, () => recarregar()));
    const box = CC.$('#fc-ck', el);
    if (m.fechado) painelRegistrado(box, m);
    else if (!fut) painelChecklist(box, ano, mes);
  };
})(window.CC = window.CC || {});
