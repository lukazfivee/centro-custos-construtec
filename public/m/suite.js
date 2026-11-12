// Seletor "Suite" (passo 4 da Suite mobile): folha inferior com os apps da esteira.
// Dentro do app Android, o Orcamentos troca de WebView por suite://app/orcamentos
// (com ?proposta= para ir direto a proposta de origem da obra); fora do app, abre
// o site em outra aba. O Chamados e O.S. so aparece se a conta tem concessao (conferida na central) e abre
// na mesma tela: suite://app/chamados no app Android; no navegador, codigo de entrada (handoff) na mesma aba.
(function (CC) {
  const { esc, icon } = CC;
  const ORC_URL = 'https://construtec-orcamentos-cloud.construtec-reports.workers.dev/';
  const inApp = () => /SuiteConstrutec\//.test(navigator.userAgent) || new URLSearchParams(location.search).has('app');
  const orcLink = (proposta) => {
    const id = proposta ? encodeURIComponent(proposta) : '';
    if (inApp()) return `suite://app/orcamentos${id ? `?proposta=${id}` : ''}`;
    return `${ORC_URL}${id ? `#proposta=${id}` : ''}`;
  };

  // Contexto da tela aberta: a obra informa a proposta de origem; CC.go limpa.
  CC.suite = { context: null, orcLink };

  const validOrigin = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.origin === value && url.pathname === '/'
        && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  };
  const chamadosItem = (origin) => `<a class="suite-item" data-chamados href="${inApp() ? 'suite://app/chamados' : esc(origin)}">${icon('wrench', 22)}<span><small>Etapa 03</small><b>Chamados e O.S.</b></span>${icon('arrow-right', 18)}</a>`;

  // A conta so ve o Chamados se a central confirma a concessao agora (sem confirmacao, o item nao aparece).
  async function chamadosAccess() {
    const owner = CC.session.token();
    try {
      const { data } = await CC.api('/auth/suite-chamados');
      if (owner !== CC.session.token() || data?.allowed !== true || data.application !== 'chamados' || !validOrigin(data.origin)
        || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) return null;
      return data.origin;
    } catch { return null; }
  }

  // No navegador: pede o codigo de uso unico (so vale no Chamados) e segue na MESMA aba, sem popup.
  async function enterChamados(origin) {
    try {
      const { data } = await CC.api('/auth/suite-handoff', { method: 'POST', body: { target: 'chamados' } });
      if (data?.target !== 'chamados' || data.origin !== origin || !/^[A-Za-z0-9_-]{43}$/.test(data.code)
        || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error('A entrada no Chamados expirou. Tente de novo.');
      location.assign(`${origin}/#handoff=${data.code}`);
    } catch (error) {
      CC.toast(error.status === 0 ? 'Sem internet.' : (error.message || 'Não foi possível abrir o Chamados.'), 'warning-circle');
    }
  }

  function onKey(event) { if (event.key === 'Escape') close(); }
  function close() {
    const el = document.getElementById('suite-sheet');
    if (el) el.remove();
    document.removeEventListener('keydown', onKey);
  }

  CC.suite.open = function () {
    if (CC.sv && CC.sv.role() === 'tecnico') return;
    close();
    const origem = CC.suite.context && CC.suite.context.proposta;
    const other = inApp() ? '' : ' target="_blank" rel="noopener"';
    const el = document.createElement('div');
    el.id = 'suite-sheet';
    el.className = 'sheet-backdrop';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="suite-title">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><b id="suite-title">${icon('squares-four', 18)}Esteira Operacional Construtec</b>
        <button type="button" class="sheet-x" aria-label="Fechar">${icon('x', 20)}</button></div>
      ${origem && origem.id ? `<p class="sheet-sec">Ir direto para</p>
        <a class="suite-item ctx" href="${esc(orcLink(origem.id))}"${other}>${icon('arrow-right', 20)}<span><b>Proposta de origem</b><small>${esc(origem.numero || '')} no Orçamentos</small></span>${icon('caret-right', 18)}</a>` : ''}
      <p class="sheet-sec">Sistemas</p>
      <a class="suite-item" href="${esc(orcLink())}"${other}>${icon('receipt', 22)}<span><small>Etapa 01</small><b>Orçamentos</b></span>${icon('caret-right', 18)}</a>
      <div class="suite-item current" aria-current="page">${icon('buildings-fill', 22)}<span><small>Etapa 02</small><b>Centro de Custos</b></span><em>Atual</em></div>
      <span data-chamados-slot></span>
    </div>`;
    let chamadosOrigin = null;
    el.addEventListener('click', (event) => {
      if (event.target === el || event.target.closest('.sheet-x')) close();
      else if (event.target.closest('[data-chamados]') && !inApp()) { event.preventDefault(); close(); if (chamadosOrigin) void enterChamados(chamadosOrigin); }
      else if (event.target.closest('a')) setTimeout(close, 0); // deixa o link navegar antes de fechar
    });
    document.body.appendChild(el);
    void chamadosAccess().then((origin) => {
      const slot = document.getElementById('suite-sheet') === el ? el.querySelector('[data-chamados-slot]') : null;
      if (!origin || !slot) return;
      chamadosOrigin = origin;
      slot.insertAdjacentHTML('beforebegin', chamadosItem(origin));
    });
    document.addEventListener('keydown', onKey);
    CC.$('.sheet-x', el).focus();
  };

  document.addEventListener('click', (event) => { if (event.target.closest('[data-suite]')) CC.suite.open(); });
})(window.CC = window.CC || {});
