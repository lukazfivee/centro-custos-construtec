// C6: Obras, Obra (orcado x realizado, medicoes, curva S, relatorio, importar, descarte) e Servicos.
// Reutiliza o motor e o banco ficticio do C1 (estados D3a e D3b) e acrescenta Servicos e descarte.
require('./c6-isolamento');
const assert = require('node:assert/strict');
const path = require('node:path');
const { catalogo, t } = require('./telas');
const cdp = require('./cdp');
const raiz = path.resolve(__dirname, '../..');
const pasta = path.join(raiz, 'docs/suite-desktop/validacao/C6');

// Tipo da carteira (Obras, Servicos, Todos) fica guardado no navegador; cada estado escolhe o seu.
const tipo = (valor) => async (c) => {
  await c.tocar(`[data-seg="tipo"][data-valor="${valor}"]`);
  await c.dormir(900);
};
const obraDe = (c, chave) => c.avaliar(`CC.api('/centros-custo').then((r) => r.data.find((o) => o.id === ${c.s.obras[chave].id}))`);

const originais = catalogo.filter((x) => x.grupo === 'D3a' || x.grupo === 'D3b');
for (const tela of originais) {
  // Os estados do C1 abrem a carteira; a escolha de tipo salva por outro estado nao pode vazar.
  if (tela.rota === 'obras') {
    const preparar = tela.preparar;
    tela.preparar = async (c) => { await tipo('obra')(c); if (preparar) await preparar(c); };
  }
}
catalogo.splice(0, catalogo.length, ...originais);

t('D3a', 'carteira-servicos', { rota: 'obras', preparar: tipo('servico') });
t('D3a', 'carteira-todos', { rota: 'obras', preparar: tipo('todos') });
t('D3a', 'novo-servico', { rota: 'obras', async preparar(c) { await tipo('servico')(c); await c.tocar('[data-nova]'); await c.painel(); } });
t('D3a', 'servico-detalhe', { rotaDe: (s) => `servicos/${s.obras.servico.id}` });
t('D3a', 'servico-detalhe-rolado', { rotaDe: (s) => `servicos/${s.obras.servico.id}`, async preparar(c) { await c.rolar('#conteudo', 'fim'); } });
t('D3a', 'descartar-obra', { rota: 'obras', async preparar(c) {
  await tipo('obra')(c);
  const obra = await obraDe(c, 'aurora');
  assert.ok(obra, 'Obra Aurora nao encontrada');
  await c.avaliar(`CC.d.obras.descartar(${JSON.stringify(obra)}, () => {})`);
  await c.painel();
} });
t('D3a', 'obras-descartadas', { rota: 'obras', async preparar(c) { await tipo('obra')(c); await c.tocar('[data-descartadas]'); await c.painel(); } });

// Sonda do C4, generalizada: corte, rolagem horizontal e rolagem interna na pagina e no painel lateral.
for (const tela of catalogo) {
  const preparar = tela.preparar;
  tela.preparar = async (c) => {
    if (preparar) await preparar(c);
    await c.dormir(400);
    const falhas = await c.avaliar(`(() => {
      const falhas = [];
      for (const raiz of document.querySelectorAll('#conteudo, .drawer .dcorpo')) {
        if (raiz.scrollWidth > raiz.clientWidth + 2) falhas.push('horizontal: ' + raiz.className);
        for (const e of raiz.querySelectorAll('*')) {
          if (!e.getClientRects().length || e.closest('[hidden]')) continue;
          const cs = getComputedStyle(e);
          if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && !['SELECT', 'TEXTAREA'].includes(e.tagName)) falhas.push('rolagem interna: ' + e.tagName.toLowerCase() + '.' + e.className);
          if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2) falhas.push('rolagem horizontal: ' + e.tagName.toLowerCase() + '.' + e.className);
          if (/(hidden|clip)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2 && e.textContent.trim() && !/(^|\\s)(tx|elip|trunc)/.test(e.className)) falhas.push('corte: ' + e.tagName.toLowerCase() + '.' + e.className);
        }
      }
      const rod = document.querySelector('.drawer .drod')?.getBoundingClientRect();
      if (rod && (rod.bottom > innerHeight + 1 || rod.right > innerWidth + 1)) falhas.push('rodape fora da janela');
      return [...new Set(falhas)];
    })()`);
    if (falhas.length) console.log(`[c6] ${tela.grupo}/${tela.id}: ${falhas.join(' | ')}`);
    assert.deepEqual(falhas, [], 'Corte ou rolagem aninhada');
  };
}

const args = process.argv.slice(2);
assert.ok(!args.includes('--validacao'), 'C6 nao sobrescreve evidencias D3a/D3b do C1');
if (!args.includes('--porta')) process.argv.push('--porta', '3231');
assert.equal(process.argv[process.argv.indexOf('--porta') + 1], '3231', 'C6 usa app 3231, Chrome 3232, Referencia 3233, nuvem 3234, Worker 3235');
if (!args.includes('--tamanhos')) process.argv.push('--tamanhos', '1280x720,1280x800,1440x900');
if (!args.includes('--saida')) process.argv.push('--saida', path.join(pasta, 'depois'));
const saida = path.resolve(process.argv[process.argv.indexOf('--saida') + 1]);
assert.ok(saida.startsWith(pasta + path.sep), 'Saida deve ficar dentro de validacao/C6');
(async () => {
  if (!args.includes('--listar')) {
    const chrome = await cdp.abrirChrome({ porta: 3232 });
    await chrome.encerrar();
  }
  require('./conferir');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
