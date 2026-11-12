// A gestão do dia usa a mesma interface no celular e no desktop.
(function (CC) {
  CC.screens.programacao = async function (params = {}) {
    const token = CC.session.token();
    if (CC.sv) await CC.sv.loadPerms();
    if (!token || CC.session.token() !== token || (params.__nav && params.__nav !== CC.nav)) return;
    const el = CC.render('', true, params);
    // Mesma barra das outras telas internas: Voltar (para o Menu) e titulo de 17 px.
    const cabecalho = (titulo, sub) => `<div class="top"><button class="back" type="button" data-pe-voltar aria-label="Voltar">${CC.icon('caret-left', 20)}</button>
      <span class="grow"><h1>${CC.esc(titulo)}</h1>${sub ? `<small class="muted">${CC.esc(sub)}</small>` : ''}</span></div>`;
    el.addEventListener('click', (e) => { if (e.target.closest('[data-pe-voltar]')) CC.go('menu'); });
    return CC.programacaoEscritorio.mount(el, { dia: params.dia, cabecalho, vivo: () => !params.__nav || params.__nav === CC.nav });
  };
})(window.CC = window.CC || {});
