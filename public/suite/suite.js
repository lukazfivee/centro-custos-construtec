// Public app choice only. Authentication and layout preferences stay with each app.
(function () {
  'use strict';
  const centre = document.getElementById('app-centro');
  function centrePath() {
    const phone = /Android|iPhone|iPad|iPod|Mobile|SuiteConstrutec\//i.test(navigator.userAgent);
    const narrow = matchMedia('(max-width: 767px)').matches && matchMedia('(pointer: coarse)').matches;
    return phone || narrow ? '/m/' : '/d/';
  }
  function syncCentreLink() { if (centre) centre.setAttribute('href', centrePath()); }
  syncCentreLink();
  const viewport = matchMedia('(max-width: 767px)');
  if (viewport.addEventListener) viewport.addEventListener('change', syncCentreLink);

  // Old links to the Central root carried explicit handoffs or financial deep links.
  // Their destinations remain the Central; ordinary visits always stay at the choice.
  if (location.pathname === '/') {
    const fragment = location.hash.slice(1);
    const params = new URLSearchParams(fragment);
    const handoff = /^[A-Za-z0-9_-]{43}$/.test(params.get('handoff') || '');
    const obra = /^[1-9][0-9]*$/.test(params.get('obra') || '');
    const pedidos = params.get('pedidos') === '1';
    const desktopRoute = /^\/(inicio|obras|lancamentos|medicoes|fornecedores|categorias|relatorios|usuarios|configuracoes|avisos)(?:[/?]|$)/.test(fragment);
    if (handoff || obra || pedidos || desktopRoute) location.replace(centrePath() + location.search + location.hash);
  }
})();
