// Ficha de entrega ou conferencia: abre em dialogo logo depois do registro e so imprime a folha.
(function (CC) {
  const D = CC.d;
  const L = D.logi;
  const { esc } = CC;
  const TITULOS = { entrega_material: 'Ficha de entrega de materiais', conferencia_inicial: 'Conferência inicial de ferramentas', entrega_ferramenta: 'Ficha de entrega de ferramentas' };

  L.ficha = (recibo) => {
    const anterior = document.activeElement;
    const material = recibo.tipo === 'entrega_material';
    const linhas = [
      ...(recibo.ferramentas || []).map((item) => `<tr><td>${esc(item.nome)}</td><td>${esc(item.codigo)}</td></tr>`),
      ...(recibo.materiais || []).map((item) => `<tr><td>${esc(item.nome)}</td><td>${esc(L.qtd(item.quantidade))} ${esc(item.unidade)}</td></tr>`),
    ].join('');
    const camada = D.el(`<div class="dialogo-camada logi-ficha-camada"><div class="card dialogo lista logi-ficha-dlg" role="dialog" aria-modal="true" aria-labelledby="logi-ficha-titulo">
      <b id="logi-ficha-titulo">Registro feito. Imprima a ficha para o técnico assinar.</b>
      <article class="logi-recibo"><h1>${esc(TITULOS[recibo.tipo] || TITULOS.entrega_ferramenta)}</h1>
        <p><b>Técnico:</b> ${esc(recibo.tecnico)}</p>${recibo.centro ? `<p><b>Obra/serviço:</b> ${esc(recibo.centro)}</p>` : ''}
        <p><b>Entregue por:</b> ${esc(recibo.emissor || '—')}</p><p><b>Data e hora:</b> ${esc(L.data(recibo.criado_em))}</p>
        <p><b>Ficha:</b> ${esc(L.rotulo(recibo.status))}</p>
        <table><thead><tr><th>${material ? 'Material' : 'Ferramenta'}</th><th>${material ? 'Quantidade' : 'Código de patrimônio'}</th></tr></thead><tbody>${linhas}</tbody></table>
        <p class="logi-assinatura">Assinatura do técnico: ______________________________</p></article>
      <div class="bts"><button type="button" class="btn btn-s" data-fechar>Fechar</button><button type="button" class="btn btn-p" data-imprimir>${D.ic('printer')}Imprimir ficha</button></div></div></div>`);
    const fechar = () => { document.removeEventListener('keydown', teclas, true); camada.remove(); anterior?.focus?.(); };
    const teclas = (event) => { if (event.key === 'Escape') { event.preventDefault(); fechar(); } else D.prenderFoco(camada, event); };
    CC.$('[data-fechar]', camada).addEventListener('click', fechar);
    CC.$('[data-imprimir]', camada).addEventListener('click', () => window.print());
    document.addEventListener('keydown', teclas, true);
    document.body.appendChild(camada);
    CC.$('[data-imprimir]', camada).focus();
  };
})(window.CC);
