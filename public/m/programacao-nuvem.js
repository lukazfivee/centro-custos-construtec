// Contas corporativas do Windows abrem a mesma agenda usada pelos celulares.
(function (CC) {
  function avisoExterno(slot, current) {
    if (!slot) return;
    slot.innerHTML = '<section class="card"><h2>Programação diária</h2><p>A agenda foi aberta no navegador, junto com as atualizações da equipe.</p><button type="button" class="btn2" data-pg-cloud-open>Abrir novamente</button><p role="status" data-pg-cloud-status></p></section>';
    const button = slot.querySelector('[data-pg-cloud-open]');
    button.addEventListener('click', async () => {
      if (!current() || button.disabled) return;
      button.disabled = true;
      try { await CC.programacaoNuvem(current, slot); }
      catch (error) { if (current()) slot.querySelector('[data-pg-cloud-status]').textContent = error.message; }
      finally { if (current()) button.disabled = false; }
    });
  }
  CC.programacaoNuvem = async function (valid = () => true, slot) {
    const token = CC.session.token();
    const sessao = CC.programacaoFila ? CC.programacaoFila.sessao() : () => token === CC.session.token();
    const current = () => sessao() && valid();
    try {
      const { data } = await CC.api('/programacao/abrir-nuvem', { method: 'POST' });
      if (!current()) return true;
      if (!data.url) return false;
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('O endereço seguro da programação não está disponível.');
      if (window.electronAPI) {
        // Preserva o token local que a Suíte usa para entrar no módulo Orçamentos.
        window.open(url.href, '_blank', 'noopener,noreferrer');
        avisoExterno(slot, current);
      } else location.assign(url.href);
      return true;
    } catch (error) {
      if (!current()) return true;
      if ((error.status === 403 || error.status === 404) && CC.programacaoFila) {
        await CC.programacaoFila.invalidarCache(current);
        if (!current()) return true;
      }
      // Sem rede, a agenda já consultada continua disponível no cache da própria sessão.
      if (error.status === 0) return false;
      throw error;
    }
  };
})(window.CC = window.CC || {});
