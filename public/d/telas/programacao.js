(function (CC) {
  CC.d.tela('programacao', {
    async render(el, rota, vivo) {
      return CC.programacaoEscritorio.mount(el, { dia: rota.query.dia, vivo });
    },
  });
})(window.CC);
