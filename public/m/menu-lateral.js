// Menu lateral do celular (mesma organizacao do Menu do Orcamentos): o botao Menu da barra desliza este painel
// da esquerda, sobre a tela aberta, com o conteudo montado em screen-misc.js. Toque fora, Esc ou qualquer item fecha.
(function (CC) {
  let raiz = null;

  function garantir() {
    if (raiz && raiz.isConnected) return raiz;
    raiz = document.createElement('div');
    raiz.id = 'menu-lateral';
    raiz.className = 'ml';
    raiz.setAttribute('aria-hidden', 'true');
    raiz.innerHTML = '<button type="button" class="ml-scrim" aria-label="Fechar menu" tabindex="-1"></button>'
      + '<aside class="ml-painel" id="ml-painel" role="dialog" aria-label="Menu" inert></aside>';
    raiz.addEventListener('click', (event) => {
      if (event.target.closest('.ml-scrim')) return fechar();
      // Item que so troca algo no proprio painel (modo escuro) mantem o menu aberto.
      const item = event.target.closest('button, a');
      if (item && !item.hasAttribute('data-ml-fica')) return fechar();
      return undefined;
    });
    document.body.appendChild(raiz);
    return raiz;
  }

  const aberto = () => !!raiz && raiz.classList.contains('open');
  function onKey(event) { if (event.key === 'Escape') fechar(); }

  function abrir() {
    const el = garantir();
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    CC.$('#ml-painel', el).removeAttribute('inert');
    document.addEventListener('keydown', onKey);
  }
  function fechar() {
    if (!raiz) return;
    raiz.classList.remove('open');
    raiz.setAttribute('aria-hidden', 'true');
    CC.$('#ml-painel', raiz).setAttribute('inert', '');
    document.removeEventListener('keydown', onKey);
  }

  // Troca o conteudo do painel e devolve o elemento (como CC.render faz com a tela).
  function painel(html) {
    const corpo = CC.$('#ml-painel', garantir());
    corpo.innerHTML = html;
    return corpo;
  }

  CC.menuLateral = { abrir, fechar, aberto, painel };
})(window.CC = window.CC || {});
