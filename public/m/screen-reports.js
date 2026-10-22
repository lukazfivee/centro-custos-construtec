// Reports no celular, como no desktop (public/d/telas/reports*.js): indicadores, lista com a situacao
// da entrega, detalhe, responder (admin e gestor), reenviar e novo report (screen-report-novo.js).
// Rotas em routes/bugReports.js: quem nao e admin nem gestor ve so os proprios reports.
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm;
  const R = CC.rep = CC.rep || {};
  const FILTROS = [['todos', 'Todos'], ['entregues', 'Entregues'], ['fila', 'Na fila'], ['falharam', 'Falharam']];
  R.TIPOS = { bug: ['Erro', 'bug'], sugestao: ['Sugestão', 'lightbulb'], melhoria: ['Melhoria', 'lightbulb'], duvida: ['Dúvida', 'info'] };
  R.tipo = (v) => R.TIPOS[v] || ['Outro', 'info'];
  R.mes = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7); };
  const curto = (t, n) => (String(t || '').length > n ? `${String(t).slice(0, n - 1).trim()}…` : String(t || ''));
  const podeResponder = () => ['admin', 'gestor'].includes(A.papelReal());

  // Situacao da entrega: grupo, rotulo, tom da etiqueta, nota e se pode reenviar.
  R.entrega = (r) => {
    const resposta = r.resposta_equipe ? curto(r.resposta_equipe, 60) : '';
    switch (r.delivery_status) {
      case 'delivered': return { grupo: 'entregues', rotulo: 'Entregue', tom: 'ok', nota: resposta || 'Recebido pela equipe', reenviar: false };
      case 'accepted': return { grupo: 'entregues', rotulo: 'Recebido', tom: '', nota: resposta || 'Confirmando a entrega', reenviar: false };
      case 'failed': return { grupo: 'falharam', rotulo: 'Falhou', tom: 'warn', nota: `Falha no envio: ${curto(r.last_delivery_error || 'sem detalhe', 50)}`, reenviar: true };
      case 'pending': case 'sending':
        return { grupo: 'fila', rotulo: 'Na fila', tom: 'warn', nota: /configurad/i.test(r.last_delivery_error || '') ? 'Entrega central não configurada' : (r.delivery_status === 'sending' ? 'Enviando agora' : 'Aguardando envio'), reenviar: true };
      default: return { grupo: 'outro', rotulo: 'Registrado', tom: '', nota: 'Anterior ao controle de entrega', reenviar: false };
    }
  };

  R.reenviar = async function (id, botao) {
    if (botao) CC.busy(botao, 'Reenviando…');
    try {
      const { data } = await CC.api(`/bug-reports/${id}/retry`, { method: 'POST', body: {} });
      if (data.ok) CC.toast('Report entregue à equipe');
      else if (data.reason === 'not_configured') CC.toast('A entrega central não está configurada · o report fica guardado', 'info');
      else CC.toast('Sem resposta do servidor central · o report segue na fila', 'warning-circle');
    } catch (error) { CC.toast(A.erroTexto(error, 'Reenviar'), 'warning-circle'); }
  };

  let filtro = 'todos', busca = '';

  CC.screens.reports = async function (params) {
    if (!(await A.guard(params, null, 'Reports'))) return;
    const topo = A.top('Reports', 'Problemas e sugestões enviados à equipe');
    A.voltar(CC.render(`${topo}<div class="skeleton"></div><div class="skeleton"></div>`, true, params));
    let todos;
    try { todos = (await CC.api('/bug-reports')).data || []; } catch (error) {
      const el = CC.render(`${topo}<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 28)}${esc(A.erroTexto(error, 'A lista de reports'))}</div>
        <button class="btn" type="button" id="rp-novo">${icon('plus', 18)}Novo report</button>`, true, params);
      A.voltar(el);
      CC.$('#rp-novo', el).addEventListener('click', () => CC.go('report-novo'));
      return;
    }
    const mes = CC.month();
    const doMes = todos.filter((r) => R.mes(r.created_at) === mes);
    const conta = (lista, g) => lista.filter((r) => R.entrega(r).grupo === g).length;
    const kpi = (rotulo, n, tom) => `<div class="adm-kpi"><b class="${tom || ''}">${n}</b><small>${esc(rotulo)}</small></div>`;
    const el = CC.render(`${topo}
      <div class="adm-kpis">${kpi('Enviados no mês', doMes.length)}${kpi('Entregues', conta(doMes, 'entregues'), 'ok')}${kpi('Na fila', conta(todos, 'fila'), conta(todos, 'fila') ? 'warn' : '')}${kpi('Falharam', conta(todos, 'falharam'), conta(todos, 'falharam') ? 'warn' : '')}</div>
      <button class="btn" type="button" id="rp-novo">${icon('plus', 18)}Novo report</button>
      <label class="field busca"><span class="sr">Buscar</span>${icon('magnifying-glass', 18)}<input id="rp-busca" type="search" autocomplete="off" value="${esc(busca)}" placeholder="Título ou descrição"></label>
      <div class="seg" role="group" aria-label="Situação da entrega">${FILTROS.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filtro}">${l}</button>`).join('')}</div>
      <div id="rp-lista"></div>`, true, params);
    A.voltar(el);
    CC.$('#rp-novo', el).addEventListener('click', () => CC.go('report-novo'));
    const pintar = () => {
      const q = busca.trim().toLowerCase();
      const vis = todos.filter((r) => (filtro === 'todos' || R.entrega(r).grupo === filtro) && (!q || [r.titulo, r.descricao].join(' ').toLowerCase().includes(q)));
      CC.$('#rp-lista', el).innerHTML = vis.length ? `<div class="adm-lista solta">${vis.map((r) => {
        const e = R.entrega(r), t = R.tipo(r.tipo);
        return `<button class="adm-row" type="button" data-id="${Number(r.id)}"><span class="adm-ic">${icon(t[1], 18)}</span><span class="grow"><b>${esc(r.titulo)}</b>
          <small>${esc([t[0], r.author_name, A.quando(r.created_at)].filter(Boolean).join(' · '))}</small><small class="adm-det">${esc(e.nota)}</small></span>
          <span class="tag${e.tom ? ` ${e.tom}` : ''}">${esc(e.rotulo)}</span></button>`;
      }).join('')}</div><p class="sub adm-sub">${vis.length} de ${A.plural(todos.length, 'report', 'reports')}</p>`
        : `<div class="empty">${icon('bug', 28)}${todos.length ? 'Nenhum report neste filtro.' : 'Nenhum report enviado ainda.'}</div>`;
      CC.$$('[data-id]', el).forEach((b) => b.addEventListener('click', () => CC.go('report', { id: Number(b.dataset.id) })));
    };
    CC.$('#rp-busca', el).addEventListener('input', (e) => { busca = e.target.value; pintar(); });
    CC.$$('[data-f]', el).forEach((b) => b.addEventListener('click', () => {
      filtro = b.dataset.f;
      CC.$$('[data-f]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pintar();
    }));
    pintar();
  };

  async function carregarPrint(id, alvo) {
    try {
      const r = await fetch(`/api/bug-reports/${id}/anexo`, { headers: { Authorization: `Bearer ${CC.session.token()}` }, cache: 'no-store' });
      if (!r.ok) throw new Error('sem print');
      const url = URL.createObjectURL(await r.blob());
      alvo.innerHTML = `<img class="lanc-foto" src="${url}" alt="Print enviado junto com o report">`;
    } catch { alvo.innerHTML = '<p class="adm-nota">Não foi possível carregar o print.</p>'; }
  }

  CC.screens.report = async function (params) {
    const id = Number(params && params.id);
    const topo = A.top('Report');
    A.voltar(CC.render(`${topo}<div class="skeleton"></div>`, true, params), 'reports');
    let r;
    try { r = (await CC.api(`/bug-reports/${id}`)).data; } catch (error) {
      if (error.status === 404) { CC.toast('Este report não existe mais.', 'warning-circle'); return CC.go('reports'); }
      return CC.errorScreen(document.getElementById('view'), error, () => CC.screens.report(params));
    }
    const e = R.entrega(r), t = R.tipo(r.tipo), d = r.diagnostico;
    const acoes = d && Array.isArray(d.acoes) ? d.acoes : [];
    const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    const el = CC.render(`${A.top(r.titulo, `${t[0]} · ${A.quando(r.created_at)}`)}
      <div class="card">${kv('Onde', r.tela || 'Não informado')}${kv('Enviado por', r.author_name || 'Você')}${kv('Entrega', `${e.rotulo} · ${e.nota}`)}
        ${kv('Tentativas', String(r.delivery_attempts || 0))}${r.central_report_id ? kv('Código na equipe', r.central_report_id) : ''}
        ${kv('Diagnóstico', d ? `Incluído · ${A.diagResumo(d)}` : 'Não incluído')}</div>
      ${acoes.length ? `<details class="card adm-acoes"><summary>Últimas ${acoes.length} ações</summary><ol>${acoes.map((a) => `<li>${esc(a.acao)}</li>`).join('')}</ol></details>` : ''}
      <div class="card"><span class="label">Descrição</span><p class="lanc-obs">${esc(r.descricao)}</p></div>
      ${r.tem_anexo ? '<div class="card"><span class="label">Print</span><div id="rp-print"><div class="skeleton"></div></div></div>' : ''}
      ${podeResponder() ? `<div class="card"><label class="field"><span>Resposta da equipe do sistema</span>
        <textarea id="rp-resp" rows="4" maxlength="5000" placeholder="Escreva a resposta para quem enviou o report.">${esc(r.resposta_equipe || '')}</textarea></label>
        <button class="btn2" type="button" id="rp-responder" style="width:100%;margin-top:10px">${icon('paper-plane-right', 18)}${r.resposta_equipe ? 'Atualizar resposta' : 'Responder'}</button></div>`
        : `<div class="card"><span class="label">Resposta da equipe do sistema</span><p class="lanc-obs${r.resposta_equipe ? '' : ' muted'}">${esc(r.resposta_equipe || 'A equipe ainda não respondeu.')}</p></div>`}
      ${e.reenviar ? `<button class="btn" type="button" id="rp-reenviar">${icon('arrow-clockwise', 18)}Reenviar</button>` : ''}`, true, params);
    A.voltar(el, 'reports');
    const again = () => { if (params.__nav === CC.nav) CC.screens.report(params).catch(() => {}); };
    const alvo = CC.$('#rp-print', el);
    if (alvo) carregarPrint(r.id, alvo);
    const resp = CC.$('#rp-responder', el);
    if (resp) resp.addEventListener('click', async () => {
      const texto = CC.$('#rp-resp', el).value.trim();
      if (!texto) { CC.toast('Escreva a resposta antes de enviar.', 'warning-circle'); return; }
      CC.busy(resp, 'Salvando…');
      try { await CC.api(`/bug-reports/${r.id}`, { method: 'PUT', body: { resposta: texto } }); CC.toast('Resposta registrada.'); } catch (error) { CC.toast(A.erroTexto(error, 'Responder'), 'warning-circle'); }
      again();
    });
    const re = CC.$('#rp-reenviar', el);
    if (re) re.addEventListener('click', async () => { await R.reenviar(r.id, re); again(); });
    return undefined;
  };
})(window.CC = window.CC || {});
