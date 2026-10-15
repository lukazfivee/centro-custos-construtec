// A gestão do dia usa a mesma interface no celular e no desktop.
(function (CC) {
  CC.screens.programacao = async function (params = {}) {
    const token = CC.session.token();
    if (CC.sv) await CC.sv.loadPerms();
    if (!token || CC.session.token() !== token || (params.__nav && params.__nav !== CC.nav)) return;
    const el = CC.render('', true, params);
    return CC.programacaoEscritorio.mount(el, { dia: params.dia, vivo: () => !params.__nav || params.__nav === CC.nav });
  };
})(window.CC = window.CC || {});
