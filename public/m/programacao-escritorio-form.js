// Formulário compartilhado do escritório; o destino de uma atividade salva é imutável.
(function (CC) {
  const P = CC.programacaoEscritorio = CC.programacaoEscritorio || {};
  const { esc } = CC;
  const q = (s, el) => el.querySelector(s);
  const qa = (s, el) => Array.from(el.querySelectorAll(s));
  P.semProgramacao = (tecnicos, atuais) => [...new Set([...atuais.map(String), ...tecnicos.filter((t) => !t.programado).map((t) => String(t.id))])];
  P.payload = (v, a, copiar) => {
    if (!v.tecnicos.length) throw new Error('Selecione pelo menos um técnico.');
    if (!String(v.orientacao || '').trim()) throw new Error('Escreva a orientação do dia.');
    if (!Number.isInteger(Number(v.ordem)) || Number(v.ordem) < 0) throw new Error('A ordem deve ser um número inteiro a partir de zero.');
    if (copiar && v.dia === a.dia) throw new Error('Escolha outro dia para a cópia.');
    const body = { dia: v.dia, orientacao: v.orientacao.trim(), ordem: Number(v.ordem), tecnicos: v.tecnicos.map(Number) };
    if (a && !copiar) body.revision = a.revision;
    else { body.centroId = a ? a.centro.id : Number(v.centroId); if (copiar) body.origemId = a.id; }
    return body;
  };

  P.form = async function (slot, { atividade, copiar, dia, live, saved, close }) {
    const a = atividade;
    let revision = a && a.revision;
    let options = { centros: [], tecnicos: [] };
    let optionsVersion = 0;
    let busy = false;
    slot.innerHTML = `<section class="pe-panel" aria-label="${a ? (copiar ? 'Copiar atividade' : 'Editar atividade') : 'Nova atividade'}">
      <h2>${a ? (copiar ? 'Copiar para outro dia' : 'Editar atividade') : 'Nova atividade'}</h2>
      <p>Salvar disponibiliza a atividade aos técnicos. O acesso ao destino permanece até o escritório retirar o vínculo no detalhe da obra ou serviço.</p>
      <form data-pe-form>
        <div class="pe-fields"><label>Data da atividade<input data-pe-date name="dia" type="date" required value="${esc(dia)}"></label>
        <label>Ordem no dia<input name="ordem" type="number" min="0" step="1" required value="${esc(a ? a.ordem : 0)}"></label></div>
        ${a ? `<p><b>Destino:</b> ${esc(P.destination(a.centro))}</p><p>Para trocar o destino, cancele esta atividade e crie outra.</p>` : '<label>Obra ou serviço<select name="centroId" required data-pe-center><option value="">Carregando destinos…</option></select></label>'}
        <label>Orientação do dia<textarea name="orientacao" rows="4" required maxlength="4000" data-pe-orientation>${esc(a ? a.orientacao : '')}</textarea></label>
        <fieldset><legend>Equipe — selecione os técnicos</legend><button type="button" data-pe-unscheduled disabled>Técnicos ainda sem programação</button>
          <p class="pe-note">O atalho acrescenta os nomes disponíveis à seleção. Confira a equipe antes de salvar.</p>
          <div class="pe-team-options" data-pe-technicians>Carregando técnicos…</div></fieldset>
        <p class="pe-message" role="status" aria-live="polite" data-pe-form-message></p>
        <div data-pe-conflict></div>
        <div class="pe-actions"><button type="submit" data-pe-save disabled>${copiar ? 'Salvar cópia' : 'Salvar atividade'}</button>
          <button type="button" data-pe-close>Fechar formulário</button><button type="button" data-pe-options-retry hidden>Tentar carregar opções</button></div>
      </form></section>`;
    const form = q('form', slot);
    const alive = () => live() && form.isConnected;
    const fields = form.elements;
    const message = q('[data-pe-form-message]', form);
    const save = q('[data-pe-save]', form);
    const unscheduled = q('[data-pe-unscheduled]', form);
    const selected = () => qa('input[name="tecnicos"]:checked', form).map((input) => input.value);
    const tell = (text) => { if (alive()) message.textContent = text; };
    function team(ids) {
      q('[data-pe-technicians]', form).innerHTML = options.tecnicos.map((t) => `<label class="pe-check"><input name="tecnicos" type="checkbox" value="${esc(t.id)}" ${ids.includes(String(t.id)) ? 'checked' : ''}>
        <span>${esc(t.nome)}${t.programado ? '<small>Já tem programação neste dia</small>' : ''}</span></label>`).join('') || '<p>Nenhum técnico disponível.</p>';
    }
    async function loadOptions(ids) {
      if (!alive()) return;
      const version = ++optionsVersion;
      save.disabled = true;
      unscheduled.disabled = true;
      const center = !a && fields.centroId.value;
      q('[data-pe-options-retry]', form).hidden = true;
      try {
        const { data } = await CC.api(`/programacao/opcoes?dia=${encodeURIComponent(fields.dia.value)}`);
        if (!alive() || version !== optionsVersion) return;
        options = data;
        if (!a) {
          fields.centroId.innerHTML = '<option value="">Selecione uma obra ou serviço</option>' + options.centros.map((c) => `<option value="${esc(c.id)}">${esc(P.destination(c))}</option>`).join('');
          fields.centroId.value = center || '';
        }
        team(ids);
        save.disabled = false;
        unscheduled.disabled = false;
        tell('Confira a equipe e a orientação antes de salvar.');
      } catch (error) {
        if (!alive() || version !== optionsVersion) return;
        tell(P.errorText(error));
        q('[data-pe-options-retry]', form).hidden = false;
      }
    }
    fields.dia.addEventListener('change', () => loadOptions(selected()));
    unscheduled.addEventListener('click', () => {
      team(P.semProgramacao(options.tecnicos, selected()));
      tell('Nomes acrescentados. Confira os técnicos selecionados.');
    });
    q('[data-pe-close]', form).addEventListener('click', () => { if (alive() && !busy) close(); });
    q('[data-pe-options-retry]', form).addEventListener('click', () => loadOptions(selected()));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!alive() || busy || save.disabled || !form.reportValidity()) return;
      let body;
      try {
        body = P.payload({ dia: fields.dia.value, centroId: a ? a.centro.id : fields.centroId.value,
          orientacao: fields.orientacao.value, ordem: fields.ordem.value, tecnicos: selected() }, a && { ...a, revision }, copiar);
      } catch (error) { tell(error.message); return; }
      busy = true;
      save.disabled = true;
      try {
        const { data } = await CC.api(a && !copiar ? `/programacao/${encodeURIComponent(a.id)}` : '/programacao', { method: a && !copiar ? 'PUT' : 'POST', body });
        if (!alive()) return;
        await saved(data);
      } catch (error) {
        if (!alive()) return;
        tell(P.errorText(error));
        if (error.status === 409 && a && !copiar) {
          const conflict = q('[data-pe-conflict]', form);
          conflict.innerHTML = '<button type="button" data-pe-revision>Carregar revisão atual e manter meus campos</button><div data-pe-current></div>';
          q('[data-pe-revision]', conflict).addEventListener('click', async () => {
            if (!alive()) return;
            try {
              const { data: latest } = await CC.api(`/programacao/${encodeURIComponent(a.id)}`);
              if (!alive()) return;
              if (latest.cancelada) { tell('Esta atividade foi cancelada. Os seus campos foram preservados para consulta.'); save.disabled = true; return; }
              revision = latest.revision;
              q('[data-pe-current]', conflict).innerHTML = `<p><b>Orientação salva:</b> ${esc(latest.orientacao)}</p><p><b>Data e equipe salvas:</b> ${esc(latest.dia)} · ${esc(latest.participantes.filter((p) => p.ativo).map((p) => p.nome).join(', '))}</p>`;
              tell('Revisão atual carregada. Compare os dados salvos com seus campos antes de salvar novamente.');
            } catch (reloadError) { tell(P.errorText(reloadError)); }
          });
        }
      } finally { busy = false; if (alive()) save.disabled = false; }
    });
    await loadOptions(a ? a.participantes.filter((p) => p.ativo).map((p) => String(p.id)) : []);
    if (alive()) fields.dia.focus();
  };
})(window.CC = window.CC || {});
