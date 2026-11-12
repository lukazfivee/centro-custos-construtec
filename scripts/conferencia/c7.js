// C7: Cadastros financeiros (Categorias, Fornecedores, Recorrentes). Reutiliza catalogo, motor e dados ficticios do C1.
require('./c7-isolamento');
const assert = require('node:assert/strict');
const path = require('node:path');
const { catalogo } = require('./telas');
const cdp = require('./cdp');
const pasta = path.resolve(__dirname, '../../docs/suite-desktop/validacao/C7');
catalogo.splice(0, catalogo.length, ...catalogo.filter(x => x.grupo === 'D5'));

for (const tela of catalogo) {
  const preparar = tela.preparar;
  tela.preparar = async c => {
    if (preparar) await preparar(c);
    // Sem rolagem horizontal, sem rolagem interna e sem texto cortado em <select> com a escala de letras.
    const falhas = await c.avaliar(`(() => {
      const falhas = [];
      for (const raiz of document.querySelectorAll('#conteudo, .drawer .dcorpo, .modal')) {
        if (raiz.scrollWidth > raiz.clientWidth + 2) falhas.push('horizontal: ' + raiz.className);
        for (const e of raiz.querySelectorAll('*')) {
          if (!e.getClientRects().length || e.closest('[hidden]')) continue;
          const cs = getComputedStyle(e);
          if (!['SELECT','TEXTAREA','INPUT'].includes(e.tagName)) {
            if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2) falhas.push('rolagem interna: ' + e.className);
            if (/(hidden|clip|auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2) falhas.push('corte horizontal: ' + e.className);
          }
          if (e.tagName === 'SELECT' && e.selectedOptions[0]) {
            const m = document.createElement('span');
            m.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + cs.font;
            m.textContent = e.selectedOptions[0].text; document.body.appendChild(m);
            const livre = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (m.offsetWidth > livre + 1) falhas.push('select cortado: ' + (e.getAttribute('aria-label') || e.name));
            m.remove();
          }
        }
      }
      const rod = document.querySelector('.drawer .drod')?.getBoundingClientRect();
      if (rod && (rod.bottom > innerHeight + 1 || rod.right > innerWidth + 1)) falhas.push('rodape fora da janela');
      return falhas;
    })()`);
    assert.deepEqual(falhas, [], 'Corte ou rolagem aninhada');
  };
}

const args = process.argv.slice(2);
assert.ok(!args.includes('--validacao'), 'C7 nao sobrescreve evidencias do C1');
if (!args.includes('--porta')) process.argv.push('--porta', '3241');
if (!args.includes('--tamanhos')) process.argv.push('--tamanhos', '1280x720,1280x800,1440x900');
if (!args.includes('--saida')) process.argv.push('--saida', path.join(pasta, 'depois'));
const saida = path.resolve(process.argv[process.argv.indexOf('--saida') + 1]);
assert.ok(saida.startsWith(pasta + path.sep), 'Saida deve ficar dentro de validacao/C7');
(async () => {
  if (!args.includes('--listar')) { const chrome = await cdp.abrirChrome({ porta: 3242 }); await chrome.encerrar(); }
  require('./conferir');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
