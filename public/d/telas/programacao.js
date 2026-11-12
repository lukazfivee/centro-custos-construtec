// Programacao diaria no desktop: o modulo e o do celular (m/programacao-escritorio.js), com o cabecalho padrao do ui.js.
(function (CC) {
  CC.d.tela('programacao', {
    async render(el, rota, vivo) {
      return CC.programacaoEscritorio.mount(el, { dia: rota.query.dia, vivo, cabecalho: (titulo, sub) => CC.d.ui.cabecalho({ grupo: 'Operação', titulo, sub }) });
    },
  });
})(window.CC);
