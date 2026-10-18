// Suite menu. Chamados is visible only after a fresh central access check.
(function (CC) {
  const D = CC.d;
  const { esc } = CC;
  const ITENS = [
    ['file-text', 'Orçamentos', 'Etapa 01 · propostas e BDI', 'https://construtec-orcamentos-cloud.construtec-reports.workers.dev/'],
    ['chart-bar', 'Centro de Custos', 'Etapa 02 · gestão das obras', null],
  ];
  const WEBMAIL = 'https://webmailpro.uol.com.br/';
  const ORCAMENTOS = ITENS[0][3];

  const content = (icon, title, subtitle) => '<span class="ic">' + D.ic(icon, 17)
    + '</span><span class="tx"><b>' + esc(title) + '</b><span>' + esc(subtitle) + '</span></span>';
  const item = ([icon, title, subtitle, url]) => {
    const inner = content(icon, title, subtitle);
    return url ? '<a class="res" role="menuitem" href="' + esc(url)
      + '" target="_blank" rel="noopener">' + inner + D.ic('arrow-square-out', 15) + '</a>'
      : '<div class="res atual" role="menuitem" aria-current="page">' + inner + D.ui.chip('Atual', 'ok') + '</div>';
  };
  function validOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.origin === value && url.pathname === '/'
        && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }

  async function openChamados(origin) {
    if (!validOrigin(origin)) return;
    if (window.electronAPI?.suiteSwitch) {
      try {
        const result = await window.electronAPI.suiteSwitch('chamados');
        if (!result?.switched) throw new Error('Não foi possível abrir o Chamados com esta conta.');
      } catch (error) { CC.toast(error.message, 'warning-circle'); }
      return;
    }
    // Open synchronously with the click; no identity or secret is placed in this window.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const { data } = await CC.api('/auth/suite-handoff', { method: 'POST', body: { target: 'chamados' } });
      if (data?.target !== 'chamados' || data.origin !== origin
        || !/^[A-Za-z0-9_-]{43}$/.test(data.code) || !Number.isSafeInteger(data.expiresAt)
        || data.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error('A entrada no Chamados expirou. Tente novamente.');
      const destination = origin + '/#handoff=' + data.code;
      if (popup && !popup.closed) popup.location.replace(destination);
      else location.assign(destination);
    } catch (error) {
      popup?.close();
      CC.toast(error.message || 'Não foi possível abrir o Chamados.', 'warning-circle');
    }
  }

  D.montarSuite = function () {
    const root = CC.$('.suite');
    root.innerHTML = '<button type="button" class="btn btn-s" aria-haspopup="menu" aria-expanded="false">'
      + D.ic('squares-four') + 'Suíte' + D.ic('caret-down', 12) + '</button>'
      + '<div class="pop" role="menu" aria-label="Suíte Construtec" hidden><span class="lbl">Suíte Construtec</span>'
      + ITENS.map(item).join('') + '<span data-chamados-slot></span><div class="sep" role="separator"></div>'
      + item(['envelope-simple', 'Webmail', 'E-mail corporativo UOL', WEBMAIL]) + '</div>';
    const button = CC.$('button', root), pop = CC.$('.pop', root), slot = CC.$('[data-chamados-slot]', root);
    let access = null, loading = false;

    async function refreshAccess() {
      if (loading) return;
      loading = true;
      access = null;
      slot.replaceChildren();
      const owner = CC.session.token();
      try {
        const { data } = await CC.api('/auth/suite-chamados');
        if (owner !== CC.session.token() || !root.isConnected || data?.allowed !== true
          || data.application !== 'chamados' || !validOrigin(data.origin)
          || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) return;
        access = data;
        slot.append(D.el('<button type="button" class="res" role="menuitem" data-chamados>'
          + content('wrench', 'Chamados e O.S.', 'Etapa 03 · atendimento e manutenção')
          + D.ic('arrow-square-out', 15) + '</button>'));
      } catch { /* No central confirmation means the module stays hidden. */ }
      finally { loading = false; }
    }

    const open = (yes) => {
      pop.hidden = !yes;
      button.setAttribute('aria-expanded', yes ? 'true' : 'false');
      if (yes) {
        (CC.$('a.res, button.res', pop) || button).focus();
        void refreshAccess();
      }
    };
    button.addEventListener('click', () => open(pop.hidden));
    pop.addEventListener('click', (event) => {
      const called = event.target.closest('[data-chamados]');
      if (called) {
        event.preventDefault();
        const origin = access?.origin;
        open(false);
        if (origin) void openChamados(origin);
        return;
      }
      const link = event.target.closest('a.res');
      if (link && link.href === WEBMAIL && window.electronAPI?.openWebmail) {
        event.preventDefault();
        window.electronAPI.openWebmail();
      }
      if (link && link.href === ORCAMENTOS && window.electronAPI?.suiteSwitch) {
        event.preventDefault();
        window.electronAPI.suiteSwitch('orcamentos');
      }
      if (link) open(false);
    });
    document.addEventListener('click', (event) => { if (!root.contains(event.target)) open(false); });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !pop.hidden) { event.stopPropagation(); open(false); button.focus(); }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !pop.hidden) {
        event.preventDefault();
        const choices = CC.$$('a.res, button.res', pop);
        const index = choices.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown' ? Math.min(choices.length - 1, index + 1) : Math.max(0, index - 1);
        choices[next]?.focus();
      }
    });
    void refreshAccess();
  };
})(window.CC);
