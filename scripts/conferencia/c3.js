// C3: Reports e Configuracoes. Nenhum servico externo ou dado real.
require('./c3-isolamento');
const assert = require('node:assert/strict');
const { catalogo, t } = require('./telas');
const cdp = require('./cdp');

// Estado visual do atualizador: simula somente a ponte Electron, sem baixar ou instalar.
t('D7', 'config-atualizacao', { rota: 'config/sistema', ref: 'cfgSis', async preparar(c) {
  await c.avaliar(`(() => {
    window.electronAPI = {};
    const up = CC.d.upd;
    up.estado = { status: 'available', currentVersion: '3.0.0', info: { version: '3.0.1' } };
    up.ler = async () => up.estado;
    up.verificar = async () => up.estado;
    const col = document.querySelector('.cfg-col');
    col.insertAdjacentHTML('beforeend', CC.d.cfg.atualizacaoCartao());
    CC.d.cfg.atualizacao(document.querySelector('[data-upd-cartao]'));
    document.querySelector('[data-upd-cartao]').scrollIntoView({ block: 'center' });
  })()`);
  await c.dormir(300);
} });
t('D7', 'report-diagnostico', { rota: 'reports', ref: 'repView', async preparar(c) {
  const report = await c.api('/bug-reports', 'POST', {
    titulo: 'Conferencia C3: diagnostico ficticio', descricao: 'Exemplo local para conferir o painel de diagnostico.',
    tipo: 'bug', tela: 'Reports', diagnostico: { versao: '3.0.0', navegador: 'Chrome / Windows', conexao: 'online', acoes: [{ acao: 'Abriu Reports' }] },
  }, 'admin', 201);
  await c.avaliar(`CC.d.rep.ver(${JSON.stringify(report)})`);
  await c.painel();
  await c.tocar('.rep-acoes summary');
} });
const alvos = catalogo.filter(tela => tela.grupo === 'D7' && /^(reports|report-|config-)/.test(tela.id));
for (const tela of alvos) {
  const preparar = tela.preparar;
  tela.preparar = async c => {
    if (preparar) await preparar(c);
    const layout = await c.avaliar(`(() => {
      const painel = document.querySelector('.drawer .dcorpo');
      const tabelas = [...document.querySelectorAll('#conteudo .cad-tabela .tbl')];
      return { painel: !painel || painel.scrollWidth <= painel.clientWidth + 1,
        tabelas: tabelas.every(e => e.getBoundingClientRect().width <= e.closest('.cad-tabela').getBoundingClientRect().width + 1) };
    })()`);
    assert.ok(layout.painel && layout.tabelas, 'Conteudo cortado horizontalmente');
  };
}
process.argv.push(...alvos.map(tela => `D7/${tela.id}`));
if (!process.argv.includes('--porta')) process.argv.push('--porta', '3151');
const porta = Number(process.argv[process.argv.indexOf('--porta') + 1]);
assert.ok(porta >= 3151 && porta <= 3156 && ![3152,3153,3154,3155].includes(porta), 'Use 3151 ou 3156');
if (!process.argv.includes('--tamanhos')) process.argv.push('--tamanhos', '1280x720,1280x800,1440x900');
if (!process.argv.includes('--saida')) process.argv.push('--saida', 'docs/suite-desktop/validacao/C3/depois');
(async () => {
  // Falhar antes de criar o banco se o ambiente nao permitir abrir o Chrome.
  if (!process.argv.includes('--listar')) {
    const chrome = await cdp.abrirChrome({ porta: porta + 1 });
    await chrome.encerrar();
  }
  require('./conferir');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
