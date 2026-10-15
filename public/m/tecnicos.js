// Seleção de técnicos no detalhe do item. Reutilizada no celular e desktop administrativo.
(function (CC) {
  const { esc } = CC;
  CC.tecnicos = {
    async panel(slot, id) {
      if (!slot) return;
      slot.innerHTML = '<p role="status">Carregando técnicos…</p>';
      try {
        const { data } = await CC.api(`/centros-custo/${Number(id)}/tecnicos`);
        if (!slot.isConnected) return;
        draw(slot, Number(id), data);
      } catch (error) {
        if (!slot.isConnected) return;
        slot.innerHTML = `<div class="card"><p role="alert">${esc(error.message || 'Não foi possível carregar os técnicos.')}</p><button type="button" class="btn2 btn btn-s" data-tc-retry>Tentar novamente</button></div>`;
        CC.$('[data-tc-retry]', slot).addEventListener('click', () => CC.tecnicos.panel(slot, id));
      }
    },
  };
  function draw(slot, id, data) {
    let previous = data.atribuidos.slice();
    const nomes = () => data.tecnicos.filter((u) => previous.includes(u.id)).map((u) => u.nome).join(', ');
    const unavailable = previous.filter((uid) => !data.tecnicos.some((u) => u.id === uid));
    slot.innerHTML = `<details class="card tc-equipe"><summary><b>Designar técnicos</b><small data-tc-nomes>${esc(nomes() || 'Nenhum técnico ativo designado')}</small></summary>
      <form data-tc-form><fieldset><legend>Técnicos com acesso a este item</legend>
        ${data.tecnicos.map((u) => `<label class="tc-pessoa"><input type="checkbox" name="tecnico" value="${u.id}"${previous.includes(u.id) ? ' checked' : ''}><span>${esc(u.nome)}</span></label>`).join('') || '<p>Nenhum técnico ativo cadastrado.</p>'}
      </fieldset>${unavailable.length ? '<p>Há vínculos de técnicos inativos. Ao salvar, eles serão removidos.</p>' : ''}
      <p class="muted">Os selecionados acessam a execução deste item. Para retirar o acesso, desmarque o técnico e salve.</p>
      <p data-tc-status role="status" aria-live="polite"></p>
      <button type="submit" class="btn btn-p">Salvar técnicos</button>
      <button type="button" class="btn2 btn btn-s" data-tc-reload hidden>Atualizar lista</button></form></details>`;
    const form = CC.$('[data-tc-form]', slot), status = CC.$('[data-tc-status]', slot), reload = CC.$('[data-tc-reload]', slot);
    reload.addEventListener('click', () => CC.tecnicos.panel(slot, id));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const controls = CC.$$('input,button', form);
      if (form.getAttribute('aria-busy') === 'true') return;
      const tecnicos = CC.$$('input[name="tecnico"]:checked', form).map((input) => Number(input.value));
      controls.forEach((input) => { input.disabled = true; });
      form.setAttribute('aria-busy', 'true');
      status.textContent = 'Salvando…';
      try {
        const { data: saved } = await CC.api(`/centros-custo/${id}/tecnicos`, { method: 'PUT', body: { tecnicos, anteriores: previous } });
        previous = saved.atribuidos;
        CC.$('[data-tc-nomes]', slot).textContent = nomes() || 'Nenhum técnico designado';
        status.textContent = 'Técnicos atualizados.';
      } catch (error) {
        status.textContent = error.message || 'Não foi possível salvar. Tente novamente.';
        if (error.status === 409) reload.hidden = false;
      } finally {
        form.removeAttribute('aria-busy');
        controls.forEach((input) => { input.disabled = false; });
      }
    });
  }
})(window.CC = window.CC || {});
