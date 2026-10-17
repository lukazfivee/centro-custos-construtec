// Barra de título da Suíte: acompanha a tela ativa, a janela em foco e a cor do topo do app.
const barra = document.getElementById('barra');
const atual = document.getElementById('atual');
const NOMES = { centro: 'Centro de Custos', orcamentos: 'Orçamentos' };

window.suiteBar?.onActive((target) => { atual.textContent = NOMES[target] || ''; });
window.suiteBar?.onFocus((focused) => { barra.classList.toggle('inativa', !focused); });
window.suiteBar?.onBar(({ color, light }) => {
  const root = document.documentElement.style;
  root.setProperty('--nav', color);
  root.setProperty('--texto', light ? '#0b2f3b' : '#dcecf1');
  root.setProperty('--apoio', light ? '#4d6b78' : '#8fb3c2');
});
