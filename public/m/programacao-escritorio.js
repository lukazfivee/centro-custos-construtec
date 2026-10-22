// Programação do escritório compartilhada entre celular e desktop.
(function (CC) {
  const P = CC.programacaoEscritorio = CC.programacaoEscritorio || {};
  const { esc } = CC;
  const q = (s, el) => el.querySelector(s);
  const qa = (s, el) => Array.from(el.querySelectorAll(s));
  const STATES = { pendente: 'A fazer', em_andamento: 'Em execução', pausado: 'Pausado', concluido: 'Concluído' };
  const EVENTS = { instrucao: 'Orientação alterada', equipe: 'Equipe alterada', cancelamento: 'Cancelamento', andamento: 'Andamento' };
  P.today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  P.can = () => {
    if (CC.d && CC.d.tem) return CC.d.tem('p5');
    if (CC.adm && CC.adm.can) return CC.adm.can('p5');
    if (CC.sv && CC.sv.can) return CC.sv.can('p5');
    const user = CC.session.user() || {};
    return Array.isArray(user.permissoes) ? user.permissoes.includes('p5') : ['admin', 'gestor'].includes(user.role);
  };
  P.errorText = (error) => error.status === 409 ? 'A programação mudou em outro aparelho. Seus campos foram mantidos. Carregue a revisão atual e confira antes de tentar novamente.'
    : error.status === 0 ? 'Sem conexão. Seus campos foram mantidos; tente novamente quando a internet voltar.' : error.message || 'Não foi possível concluir agora.';
  P.destination = (c) => `${c.tipo === 'servico' ? 'Serviço' : 'Obra'} · ${[c.codigo, c.cliente, c.nome].filter(Boolean).join(' — ')}`;
  P.team = (a) => `<ul class="pe-team">${a.participantes.filter((p) => p.ativo).map((p) => `<li><span>${esc(p.nome)}</span><b class="pe-state" data-state="${esc(p.estado)}">${esc(STATES[p.estado] || p.estado)}</b></li>`).join('')}</ul>`;
  P.card = (a) => {
    const active = a.participantes.filter((p) => p.ativo);
    const done = active.filter((p) => p.estado === 'concluido').length;
    return `<article class="pe-card" data-pe-activity="${esc(a.id)}">
      <h2>${esc(P.destination(a.centro))}</h2><p class="pe-note">Ordem ${esc(a.ordem)} · ${done} de ${active.length} concluídos${a.cancelada ? ' · Cancelada' : ''}</p>
      <p class="pe-orientation">${esc(a.orientacao)}</p>${P.team(a)}
      <button type="button" data-pe-detail="${esc(a.id)}">Ver equipe e histórico</button></article>`;
  };
  P.history = (events) => `<ol class="pe-history">${(events || []).map((e) => {
    const date = new Date(e.criadoEm);
    const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    return `<li><b>${esc(e.nome || 'Escritório')}</b> · ${esc(e.estado ? STATES[e.estado] || e.estado : EVENTS[e.tipo] || e.tipo)}<small>${esc(when)}</small>
      ${e.observacao ? `<p>${esc(e.observacao)}</p>` : ''}</li>`;
  }).join('') || '<li>Nenhuma atualização registrada.</li>'}</ol>`;

  P.mount = async function (slot, config = {}) {
    const token = CC.session.token();
    const owner = String((CC.session.user() || {}).id || '');
    const marker = {};
    slot.__programacao = marker;
    const live = () => slot.isConnected && slot.__programacao === marker && CC.session.token() === token
      && String((CC.session.user() || {}).id || '') === owner && (!config.vivo || config.vivo()) && P.can();
    let dia = config.dia || P.today();
    // Cabecalho de cada app: o desktop usa o do ui.js, o celular a barra com Voltar. Sem config, titulo simples.
    const SUB = 'Organize os destinos e acompanhe o andamento individual das equipes.';
    const cabecalho = (sub) => (config.cabecalho ? config.cabecalho('Programação diária', sub)
      : `<header class="pe-heading"><h1>Programação diária</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</header>`);
    let listVersion = 0;
    let detailVersion = 0;
    if (!token || !P.can()) { slot.innerHTML = `<div class="pe-office">${cabecalho('')}<p role="status">Sem permissão para programar equipes.</p></div>`; return; }
    slot.innerHTML = `<div class="pe-office">${cabecalho(SUB)}<p role="status">Carregando programação…</p></div>`;
    async function list() {
      const version = ++listVersion;
      ++detailVersion;
      if (!live()) return;
      try {
        if (CC.programacaoNuvem && await CC.programacaoNuvem(() => live() && version === listVersion, slot)) return;
        const { data } = await CC.api(`/programacao?dia=${encodeURIComponent(dia)}`);
        if (!live() || version !== listVersion) return;
        slot.innerHTML = `<div class="pe-office">${cabecalho(SUB)}
          <div class="pe-toolbar"><label>Dia da programação<input type="date" required value="${esc(dia)}" data-pe-day></label>
            <button type="button" data-pe-new>Nova atividade</button><button type="button" data-pe-refresh>Atualizar</button></div>
          <p role="status" aria-live="polite" data-pe-notice></p><div data-pe-editor></div><div data-pe-details></div>
          <div class="pe-list" data-pe-list>${(data.atividades || []).map(P.card).join('') || '<p>Nenhuma atividade programada para este dia.</p>'}</div></div>`;
        q('[data-pe-day]', slot).addEventListener('change', (e) => { if (e.target.value && live()) { dia = e.target.value; list(); } });
        q('[data-pe-refresh]', slot).addEventListener('click', () => list());
        q('[data-pe-new]', slot).addEventListener('click', () => openForm());
        qa('[data-pe-detail]', slot).forEach((button) => button.addEventListener('click', () => detail(button.dataset.peDetail)));
      } catch (error) {
        if (!live() || version !== listVersion) return;
        slot.innerHTML = `<div class="pe-office">${cabecalho('')}<p role="alert">${esc(P.errorText(error))}</p><button type="button" data-pe-retry>Tentar novamente</button></div>`;
        q('[data-pe-retry]', slot).addEventListener('click', list);
      }
    }
    function openForm(atividade, copiar = false) {
      if (!live()) return;
      const editor = q('[data-pe-editor]', slot);
      ++detailVersion;
      q('[data-pe-details]', slot).innerHTML = '';
      return P.form(editor, { atividade, copiar, dia: atividade ? atividade.dia : dia, live,
        close: () => { editor.innerHTML = ''; }, saved: async (a) => { dia = a.dia; await list(); } });
    }
    async function detail(id) {
      const version = ++detailVersion;
      if (!live()) return;
      const area = q('[data-pe-details]', slot);
      q('[data-pe-editor]', slot).innerHTML = '';
      area.innerHTML = '<p role="status">Carregando atividade…</p>';
      const alive = () => live() && area.isConnected && version === detailVersion;
      try {
        const { data: a } = await CC.api(`/programacao/${encodeURIComponent(id)}`);
        if (!alive()) return;
        area.innerHTML = `<section class="pe-panel" data-pe-detail-panel><h2>${esc(P.destination(a.centro))}</h2>
          <p>${esc(a.dia)} · Ordem ${esc(a.ordem)}</p><p class="pe-orientation">${esc(a.orientacao)}</p>
          ${a.origemId ? `<p>Copiada da atividade ${esc(a.origemId)}. O histórico do dia anterior foi preservado.</p>` : ''}
          ${a.cancelada ? `<p><b>Cancelada:</b> ${esc(a.motivoCancelamento)}</p>` : ''}${P.team(a)}
          <div class="pe-actions">${!a.cancelada ? '<button type="button" data-pe-edit>Editar atividade</button><button type="button" data-pe-copy>Copiar para outro dia</button><button type="button" data-pe-cancel>Cancelar atividade</button>' : ''}
            <button type="button" data-pe-close-detail>Fechar detalhe</button></div><div data-pe-cancel-slot></div>
          <h3>Histórico da equipe</h3>${P.history(a.eventos)}</section>`;
        q('[data-pe-close-detail]', area).addEventListener('click', () => { if (alive()) { ++detailVersion; area.innerHTML = ''; } });
        if (!a.cancelada) {
          q('[data-pe-edit]', area).addEventListener('click', () => openForm(a));
          q('[data-pe-copy]', area).addEventListener('click', () => openForm(a, true));
          q('[data-pe-cancel]', area).addEventListener('click', () => cancelForm(a, q('[data-pe-cancel-slot]', area), alive));
        }
        q('h2', area).setAttribute('tabindex', '-1');
        q('h2', area).focus();
      } catch (error) {
        if (!alive()) return;
        area.innerHTML = `<p role="alert">${esc(P.errorText(error))}</p><button type="button" data-pe-detail-retry>Tentar novamente</button>`;
        q('[data-pe-detail-retry]', area).addEventListener('click', () => detail(id));
      }
    }
    function cancelForm(a, area, alive) {
      if (!alive()) return;
      area.innerHTML = `<form class="pe-cancel" data-pe-cancel-form><p>O cancelamento preserva o histórico e o acesso já concedido ao destino.</p>
        <label>Motivo do cancelamento<textarea name="motivo" required maxlength="4000" rows="3" data-pe-cancel-reason></textarea></label>
        <p role="status" aria-live="polite" data-pe-cancel-message></p><button type="submit" data-pe-confirm-cancel>Confirmar cancelamento</button></form>`;
      const form = q('form', area);
      let busy = false;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!alive() || busy || !form.reportValidity()) return;
        const motivo = form.elements.motivo.value.trim();
        if (!motivo) { q('[data-pe-cancel-message]', form).textContent = 'Informe o motivo do cancelamento.'; return; }
        busy = true;
        const button = q('[data-pe-confirm-cancel]', form);
        button.disabled = true;
        try {
          await CC.api(`/programacao/${encodeURIComponent(a.id)}/cancelar`, { method: 'POST', body: { revision: a.revision, motivo } });
          if (alive()) await list();
        } catch (error) {
          if (!alive()) return;
          q('[data-pe-cancel-message]', form).textContent = P.errorText(error);
          if (error.status === 409) {
            const { data: latest } = await CC.api(`/programacao/${encodeURIComponent(a.id)}`).catch(() => ({ data: null }));
            if (!alive()) return;
            if (latest) { a.revision = latest.revision; q('[data-pe-cancel-message]', form).textContent += ` Confira a atividade atual: ${latest.orientacao}. Confirme novamente se ainda deseja cancelar.`; }
          }
        } finally { busy = false; if (alive()) button.disabled = false; }
      });
      form.elements.motivo.focus();
    }
    await list();
  };
})(window.CC = window.CC || {});
