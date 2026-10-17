// Detalhe compartilhado da equipe. O envio sempre usa a identidade autenticada.
(function (CC) {
  const { esc, icon } = CC, F = CC.programacaoFila;
  const dataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  CC.screens['atividade-dia'] = async function (params = {}) {
    const valid = F.sessao(), current = () => valid() && (!params.__nav || params.__nav === CC.nav);
    const el = CC.render(`${CC.header('Atividade do dia')}<div class="skeleton"></div>`, true, params);
    try {
      if (CC.programacaoNuvem && await CC.programacaoNuvem(current, el)) return;
      const result = await F.cached(`atividade-${params.id}`, `/programacao/${params.id}`);
      if (!current()) return;
      const original = result.data, a = await F.overlay(original);
      if (!current()) return;
      const pode = F.pode(a), meu = F.meu(a), ops = a.filaOps || [], last = ops[ops.length - 1];
      const draft = params.rascunho;
      let estado = draft && F.estados[draft.estado] ? draft.estado : last ? last.body.estado : meu ? meu.estado : 'pendente';
      const events = (a.eventos || []).slice().sort((x, y) => String(y.criadoEm).localeCompare(String(x.criadoEm)) || y.id - x.id);
      const view = CC.render(`${CC.header('Atividade do dia')}<button type="button" class="btn2" id="pg-voltar">${icon('arrow-left', 18)}Meu dia</button>
        <button type="button" class="chip-act" id="pg-atualizar">${icon('arrow-clockwise', 18)}Atualizar atividade</button>
        <article class="card pg-card">${F.destino(a)}<p class="sub">${esc(CC.dateFull(a.dia))}</p><p class="pg-orientacao">${esc(a.orientacao || 'Sem orientação adicional.')}</p>
        ${a.cancelada ? `<p class="pg-pendente">Atividade cancelada: ${esc(a.motivoCancelamento || '')}</p>` : ''}${F.equipe(a)}
        <button type="button" class="btn2" id="pg-execucao">${icon('list-checks', 18)}Abrir execução</button></article>${CC.staleNote(result)}${F.aviso(a)}
        ${ops.length ? `<section class="card pg-envios"><h2>Envios no celular</h2>${ops.map((i) => `<div class="pg-envio"><b>${esc(F.estados[i.body.estado])}</b><p class="pg-orientacao">${esc(i.body.observacao)}</p>
          <small>${esc(i.estado === 'erro' ? i.erro : 'Aguardando envio')}</small>${i.estado === 'erro' ? `<button type="button" class="btn2" data-pg-revisar="${esc(i.client_id)}">Revisar este envio</button>` : ''}</div>`).join('')}</section>` : ''}
        ${pode ? `<section class="card pg-editor"><h2>Meu andamento</h2><p class="sub">Atualiza somente sua participação nesta atividade.</p>
          <div class="pg-estados" role="group" aria-label="Meu andamento">${Object.entries(F.estados).map(([key, text]) => `<button class="chip-act" type="button" data-pg-estado="${key}" aria-pressed="${key === estado}">${text}</button>`).join('')}</div>
          <label class="field"><span>Observação (opcional)</span><textarea id="pg-observacao" rows="3" maxlength="4000" placeholder="Onde parou ou o que falta">${esc(draft ? draft.observacao : last ? last.body.observacao : '')}</textarea></label>
          <p id="pg-erro" class="pg-pendente" role="status" aria-live="polite"></p>
          <button class="btn" type="button" id="pg-salvar">${icon('check-circle', 18)}Registrar andamento</button></section>` : '<p class="sub">Esta atividade está disponível somente para consulta.</p>'}
        <section class="card pg-timeline"><h2>Linha do tempo da equipe</h2>${events.length ? `<ol>${events.map((e) => `<li><b>${esc(e.nome)}</b><time>${esc(dataHora(e.criadoEm))}</time><span>${esc(F.estados[e.estado] || ({ instrucao: 'Orientação atualizada', equipe: 'Equipe atualizada', cancelamento: 'Cancelamento' })[e.tipo] || 'Atualização')}</span><p class="pg-orientacao">${esc(e.observacao || '')}</p></li>`).join('')}</ol>` : '<p class="sub">Nenhuma atualização registrada.</p>'}</section>`, true, params);
      CC.$('#pg-voltar', view).addEventListener('click', () => CC.go('meu-dia', { dia: a.dia }));
      CC.$('#pg-execucao', view).addEventListener('click', () => F.execucao(a));
      const refresh = () => {
        if (!current()) return;
        CC.go('atividade-dia', { id: a.id, dia: a.dia, ...(pode ? { rascunho: { estado, observacao: CC.$('#pg-observacao', view).value } } : {}) });
      };
      CC.$('#pg-atualizar', view).addEventListener('click', refresh);
      CC.programacaoSync = refresh;
      if (!pode) return;
      const text = CC.$('#pg-observacao', view), error = CC.$('#pg-erro', view), save = CC.$('#pg-salvar', view);
      const choose = (value) => {
        estado = value;
        CC.$$('[data-pg-estado]', view).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pgEstado === estado)));
      };
      CC.$$('[data-pg-estado]', view).forEach((b) => b.addEventListener('click', () => choose(b.dataset.pgEstado)));
      CC.$$('[data-pg-revisar]', view).forEach((b) => b.addEventListener('click', async () => {
        const item = ops.find((i) => i.client_id === b.dataset.pgRevisar);
        if (!current() || !item) return;
        text.value = item.body.observacao; choose(item.body.estado);
        error.textContent = 'Texto recuperado. Confira o histórico; descarte os envios pendentes para registrar novamente.';
        const discard = document.createElement('button'); discard.type = 'button'; discard.className = 'btn2'; discard.textContent = 'Descartar envios pendentes desta atividade';
        error.appendChild(discard);
        discard.addEventListener('click', async () => {
          try { for (const i of ops) { if (!current()) return; await CC.queue.discard(i.client_id); } error.textContent = 'Envios descartados. Seu texto continua no campo; confira e registre novamente.'; }
          catch (e) { if (current()) error.textContent = e.message; }
        }); text.focus();
      }));
      save.addEventListener('click', async () => {
        if (save.disabled || !current()) return;
        save.disabled = true; error.textContent = '';
        try {
          const pending = await F.salvar(original, estado, text.value);
          if (!current()) return;
          const failed = pending.find((i) => i.estado === 'erro');
          if (failed) { refresh(); return; }
          CC.go('atividade-dia', { id: a.id, dia: a.dia });
        } catch (e) { if (current() && !(e instanceof CC.Stale)) error.textContent = `${e.message} Seu texto foi mantido.`; }
        finally { if (current()) save.disabled = false; }
      });
    } catch (error) { if (current() && !(error instanceof CC.Stale)) CC.errorScreen(el, error, () => CC.go('atividade-dia', params)); }
  };
})(window.CC = window.CC || {});
