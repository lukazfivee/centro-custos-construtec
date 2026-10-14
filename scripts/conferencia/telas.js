// Catalogo das telas do Desktop novo. Cada entrada e um estado que se confere contra a Referencia.
//   id        nome do arquivo do print (tamanho-tema-id.jpg), igual ao das pastas validacao/D0 a D5
//   grupo     fase do plano (D0 a D7), vira a pasta em validacao/
//   rota      hash aberto (sem #/), ex.: 'obras/3/curva'
//   como      quem esta logado: admin (padrao), gestor, financeiro, engenharia, tecnico, comercial
//   ref       estado do prototipo (estado.html?start=...); sem ref, a tela nao tem Referencia
//   preparar  passos depois de abrir a rota (ctx: tocar, tocarTexto, digitar, painel, dialogo, rolar, offline, api, s...)
//   muda      grava dados: roda por ultimo e precisa desfazer em limpar
// Para uma tela nova, copie uma entrada parecida. Uso e opcoes: docs/suite-desktop/validacao/README.md
const GRUPOS = ['D0', 'D1', 'D2', 'D3a', 'D3b', 'D4', 'D5', 'D6', 'D7', 'Login'];
const catalogo = [];
const t = (grupo, id, def = {}) => catalogo.push({ grupo, id, ...def });

// Passos que se repetem ------------------------------------------------------------------------
const abrirNovoLancamento = async (c) => { await c.tocar('[data-novo]'); await c.painel(); };
// A lista pagina de 25 em 25: busca o texto antes de agir na linha.
const achar = async (c, texto) => { await c.digitar('[data-f="busca"]', texto); await c.dormir(1100); };
const preencherLancamento = async (c, { descricao, valor, pago = false }) => {
  await c.digitar('.drawer [name="descricao"]', descricao);
  await c.digitar('.drawer [name="valor"]', valor);
  if (pago) await c.tocar('.drawer [data-seg="status"][data-valor="liquidado"], .drawer [data-valor="liquidado"]');
};

// D0 · Base, busca, Suite, rede ----------------------------------------------------------------
t('D0', 'inicio', { rota: 'inicio', ref: 'painel' });
t('D0', 'busca-lancamento', { rota: 'inicio', ref: 'busca', async preparar(c) {
  await c.tecla('Escape');
  await c.tocar('.busca input, .busca [data-busca]');
  await c.digitar('.busca input', 'cimento');
  await c.dormir(900);
} });
t('D0', 'suite-aberta', { rota: 'inicio', ref: 'suite', async preparar(c) { await c.tocar('.suite button, .suite [data-suite]'); await c.dormir(500); } });
t('D0', 'sem-internet', { rota: 'lancamentos', ref: 'offline', async preparar(c) { await c.offline(true); await c.ir('inicio'); await c.ir('lancamentos'); await c.dormir(900); }, async limpar(c) { await c.offline(false); } });
t('D0', 'alteracao-nao-salva', { rota: 'lancamentos', async preparar(c) {
  await abrirNovoLancamento(c);
  await c.digitar('.drawer [name="descricao"]', 'Rascunho que não foi salvo');
  await c.tecla('Escape');
  await c.dialogo();
} });

// D1 · Inicio ----------------------------------------------------------------------------------
t('D1', 'painel', { rota: 'inicio', ref: 'painel' });
t('D1', 'painel-rolado', { rota: 'inicio', async preparar(c) { await c.rolar('#conteudo', 'fim'); } });
t('D1', 'painel-uma-obra', { rota: 'inicio', async preparar(c) {
  await c.digitar('[data-f="obra"]', String(c.s.obras.aurora.id)); await c.dormir(1200);
} });
t('D1', 'painel-mes-anterior', { rota: 'inicio', async preparar(c) {
  await c.digitar('[data-f="mes"]', c.s.mesAnterior); await c.dormir(1200);
} });
t('D1', 'primeiro-uso', { rota: 'inicio',
  async preparar(c) {
    await c.s.consulta("UPDATE app_settings SET value='false' WHERE key='first_use_completed'");
    await c.recarregar();
  },
  async limpar(c) { await c.s.consulta("UPDATE app_settings SET value='true' WHERE key='first_use_completed'"); },
  muda: true });
t('D1', 'lancamento-rapido', { rota: 'inicio', ref: 'rapido', async preparar(c) { await c.tocar('[data-rapido]'); await c.painel(); } });
t('D1', 'rapido-validacao', { rota: 'inicio', ref: 'erro', async preparar(c) {
  await c.tocar('[data-rapido]'); await c.painel();
  await c.tocarTexto('.drawer .drod button', 'Registrar'); await c.dormir(500);
} });
t('D1', 'atividade-aberta', { rota: 'inicio', async preparar(c) { await c.tocar('[data-lanc]'); await c.painel(); } });
t('D0', 'assistente-aberto', { rota: 'inicio', async preparar(c) { await c.tocar('#ia-fab'); await c.dormir(900); } });

// D2 · Lancamentos ----------------------------------------------------------------------------
const FILA_LIMPA = async (c) => { await c.aba.enviar('Storage.clearDataForOrigin', { origin: c.s.url, storageTypes: 'indexeddb' }); await c.offline(false); };
t('D2', 'lista', { rota: 'lancamentos', ref: 'lanc' });
t('D2', 'filtro-a-pagar', { rota: 'lancamentos', ref: 'filtro', async preparar(c) { await c.tocar('[data-seg="sit"][data-valor="a_pagar"]'); await c.dormir(900); } });
t('D2', 'mais-filtros', { rota: 'lancamentos', async preparar(c) { await c.tocar('[data-mais]'); await c.dormir(500); } });
t('D2', 'sem-internet-fila', { rota: 'lancamentos', ref: 'offline', muda: true,
  async preparar(c) {
    await c.offline(true);
    await abrirNovoLancamento(c);
    await preencherLancamento(c, { descricao: 'Compra feita sem internet', valor: '320,00' });
    await c.tocar('.drawer [data-salvar]');
    await c.dormir(1200);
    await c.tecla('Escape'); await c.dormir(500);
    await c.ir('inicio'); await c.ir('lancamentos');
    await c.dormir(900);
  }, limpar: FILA_LIMPA });
t('D2', 'novo', { rota: 'lancamentos', ref: 'novo', preparar: abrirNovoLancamento });
t('D2', 'novo-validacao', { rota: 'lancamentos', ref: 'erro', async preparar(c) { await abrirNovoLancamento(c); await c.tocar('.drawer [data-salvar]'); await c.dormir(500); } });
t('D2', 'novo-pago', { rota: 'lancamentos', async preparar(c) {
  await abrirNovoLancamento(c);
  await preencherLancamento(c, { descricao: 'NF 18.442 · Câmeras IP dome', valor: '14.880,00', pago: true });
  await c.dormir(400);
} });
t('D2', 'editar', { rota: 'lancamentos', ref: 'editar', async preparar(c) { await achar(c, 'Locação de plataforma'); await c.tocarTexto('tr.rw', 'Locação de plataforma'); await c.painel(); } });
t('D2', 'documentos', { rota: 'lancamentos', ref: 'docs', async preparar(c) { await achar(c, 'Compra avulsa 2'); await c.linha('Compra avulsa 2', 'docs'); await c.painel(); } });
t('D2', 'estorno', { rota: 'lancamentos', ref: 'estorno', async preparar(c) { await achar(c, 'Compra avulsa 2'); await c.linha('Compra avulsa 2', 'estornar'); await c.painel(); } });
t('D2', 'excluir', { rota: 'lancamentos', ref: 'excluir', async preparar(c) { await achar(c, 'Compra avulsa 1'); await c.linha('Compra avulsa 1', 'excluir'); await c.dialogo(); } });
t('D2', 'mes-fechado', { rota: 'lancamentos', ref: 'lancLocked', async preparar(c) { await c.digitar('[data-f="mes"]', c.s.mesFechado); await c.dormir(1200); } });
t('D2', 'lancar-em-mes-fechado', { rota: 'lancamentos', ref: 'novoFechado', async preparar(c) {
  await abrirNovoLancamento(c);
  await c.digitar('.drawer [name="data"]', `${c.s.mesFechado}-10`);
  await preencherLancamento(c, { descricao: 'Compra de material de acabamento', valor: '2.480,00' });
  await c.tocar('.drawer [data-salvar]'); await c.dormir(900);
} });

// D3a · Obras ---------------------------------------------------------------------------------
const modelo = (s) => `obras/${s.obras.modelo.id}`;
const aurora = (s) => `obras/${s.obras.aurora.id}`;
t('D3a', 'carteira', { rota: 'obras', ref: 'obras' });
t('D3a', 'carteira-em-execucao', { rota: 'obras', async preparar(c) { await c.tocar('[data-seg="situacao"][data-valor="execucao"]'); await c.dormir(600); } });
t('D3a', 'nova-obra', { rota: 'obras', async preparar(c) { await c.tocar('[data-nova]'); await c.painel(); } });
t('D3a', 'editar-obra', { rota: 'obras', async preparar(c) { await c.tocar(`[data-editar="${c.s.obras.aurora.id}"]`); await c.painel(); } });
t('D3a', 'obra-orcado', { ref: 'obra', rotaDe: modelo });
t('D3a', 'obra-orcado-rolado', { rotaDe: modelo, async preparar(c) { await c.rolar('#conteudo', 'fim'); } });
t('D3a', 'obra-orcado-mao-de-obra', { rotaDe: modelo, async preparar(c) { await c.tocarTexto('[data-seg]', 'Mão de obra'); await c.dormir(500); } });
t('D3a', 'obra-sem-orcamento', { rotaDe: aurora });
t('D3a', 'obra-lancamentos', { rotaDe: (s) => `${aurora(s)}/lancamentos` });
t('D3a', 'obra-notas-fiscais', { ref: 'nf', rotaDe: (s) => `${aurora(s)}/nf` });
t('D3a', 'lancar-nf', { rotaDe: (s) => `${aurora(s)}/nf`, async preparar(c) { await c.tocar('[data-lancar-nf]'); await c.painel(); } });
t('D3a', 'lancar-despesa-da-obra', { rotaDe: aurora, async preparar(c) { await c.tocar('[data-lancar]'); await c.painel(); } });
t('D3a', 'obra-medicoes-d3b', { ref: 'med', rotaDe: (s) => `${modelo(s)}/medicoes` });

// D3b · Medicoes, Curva S, relatorio, importar -------------------------------------------------
t('D3b', 'medicoes-mao-de-obra', { ref: 'med', rotaDe: (s) => `${modelo(s)}/medicoes` });
t('D3b', 'medicoes-contrato', { ref: 'medCt', rotaDe: (s) => `${modelo(s)}/medicoes`, async preparar(c) { await c.tocar('[data-seg="med"][data-valor="ct"]'); await c.dormir(600); } });
t('D3b', 'boletim', { rotaDe: (s) => `${modelo(s)}/medicoes`, async preparar(c) { await c.tocar('[data-seg="med"][data-valor="ct"]'); await c.dormir(600); await c.tocar('[data-boletim]'); await c.dormir(1500); } });
t('D3b', 'curva-s', { ref: 'curva', rotaDe: (s) => `${modelo(s)}/curva` });
t('D3b', 'curva-s-rolada', { rotaDe: (s) => `${modelo(s)}/curva`, async preparar(c) { await c.rolar('#conteudo', 'fim'); } });
t('D3b', 'relatorio-executivo', { rotaDe: modelo, async preparar(c) { await c.tocar('[data-relatorio]'); await c.dormir(1800); } });
t('D3b', 'importar-orcamento', { rota: 'obras', async preparar(c) { await c.tocar('[data-importar]'); await c.painel(); } });
t('D3b', 'vincular-gastos-painel', { rotaDe: modelo, async preparar(c) { await c.tocar('[data-vincular]'); await c.painel(); } });

// D4 · Cobrancas ------------------------------------------------------------------------------
const cobranca = (obra, acao) => async (c) => { await c.linha(obra, acao); await c.painel(); };
t('D4', 'lista', { rota: 'cobrancas', ref: 'cob' });
t('D4', 'filtro-vencidas', { rota: 'cobrancas', async preparar(c) { await c.tocar('[data-seg="filtro"][data-valor="vencidas"]'); await c.dormir(600); } });
t('D4', 'acompanhar', { rota: 'cobrancas', ref: 'cobTrack', preparar: cobranca('Edifício Vista Verde', 'acompanhar') });
t('D4', 'acompanhar-vencida', { rota: 'cobrancas', ref: 'cobVenc', preparar: cobranca('Residencial Aurora', 'acompanhar') });
t('D4', 'editar-dados', { rota: 'cobrancas', async preparar(c) { await cobranca('Edifício Vista Verde', 'acompanhar')(c); await c.tocar('[data-dados]'); await c.dormir(600); } });
t('D4', 'email', { rota: 'cobrancas', ref: 'cobMail', preparar: cobranca('Edifício Vista Verde', 'email') });
t('D4', 'email-sem-nf', { rota: 'cobrancas', async preparar(c) { await cobranca('Edifício Vista Verde', 'email')(c); await c.tocar('[data-enviar]'); await c.dormir(1500); } });
t('D4', 'email-validacao', { rota: 'cobrancas', async preparar(c) {
  await cobranca('Laudo de fachada', 'email')(c);
  await c.digitar('.drawer [name="para"], .drawer [name="to"]', 'sem-arroba'); await c.tocar('[data-enviar]'); await c.dormir(800);
} });
t('D4', 'supervisor-email', { rota: 'cobrancas', como: 'financeiro', ref: 'comoFin', preparar: cobranca('Edifício Vista Verde', 'email') });

// D5 · Cadastros ------------------------------------------------------------------------------
t('D5', 'categorias', { rota: 'categorias', ref: 'cat' });
t('D5', 'categoria-nova', { rota: 'categorias', ref: 'catNova', async preparar(c) { await c.tocar('[data-nova]'); await c.painel(); } });
t('D5', 'categoria-editar', { rota: 'categorias', ref: 'catEdit', async preparar(c) { await c.tocar(`[data-editar="${c.s.cats['Material']}"]`); await c.painel(); } });
t('D5', 'fornecedores', { rota: 'fornecedores', ref: 'forn' });
t('D5', 'fornecedor-detalhe', { rota: 'fornecedores', ref: 'fornView', async preparar(c) { await c.tocar(`[data-editar="${c.s.forn.alfa}"]`); await c.painel(); } });
t('D5', 'fornecedor-duplicado', { rota: 'fornecedores', ref: 'fornErr', async preparar(c) {
  await c.tocar('[data-novo]'); await c.painel();
  await c.digitar('.drawer [name="nome"]', 'Outra loja de materiais');
  await c.digitar('.drawer [name="documento"]', '11.222.333/0001-81');
  await c.tocar('.drawer [data-salvar]'); await c.dormir(900);
} });
t('D5', 'recorrentes', { rota: 'recorrentes', ref: 'rec' });
t('D5', 'recorrente-novo', { rota: 'recorrentes', ref: 'recNovo', async preparar(c) { await c.tocar('[data-novo]'); await c.painel(); } });
t('D5', 'recorrentes-gerar', { rota: 'recorrentes', ref: 'recGerar', async preparar(c) { await c.tocar('[data-gerar]'); await c.dialogo(); } });
t('D5', 'recorrentes-gerado', { rota: 'recorrentes', ref: 'recFeito', muda: true,
  async preparar(c) { await c.tocar('[data-gerar]'); await c.dialogo(); await c.tocar('.dialogo-camada [data-r="1"]'); await c.dormir(1800); },
  async limpar(c) { await c.s.consulta('DELETE FROM transactions WHERE recurring_template_id IS NOT NULL'); } });

// D6 · Usuarios, papeis e permissoes ----------------------------------------------------------
t('D6', 'usuarios-lista', { rota: 'usuarios', ref: 'usu' });
t('D6', 'usuario-novo', { rota: 'usuarios', ref: 'convite', async preparar(c) { await c.tocar('[data-novo]'); await c.painel(); } });
t('D6', 'usuario-criado', { rota: 'usuarios', ref: 'senhaProv', muda: true,
  async preparar(c) {
    await c.tocar('[data-novo]'); await c.painel();
    await c.digitar('.drawer [name="nome"]', 'Helena Duarte');
    await c.digitar('.drawer [name="email"]', 'helena.duarte@rcconstrutec.com.br');
    await c.digitar('.drawer [name="senha"]', 'senha-provisoria-123');
    await c.tocar('.drawer [data-salvar]'); await c.dormir(1500);
  },
  async limpar(c) {
    await c.s.consulta("DELETE FROM user_cost_centers WHERE user_id IN (SELECT id FROM users WHERE email='helena.duarte@rcconstrutec.com.br')");
    await c.s.consulta("DELETE FROM users WHERE email='helena.duarte@rcconstrutec.com.br'");
    await c.s.consulta("DELETE FROM audit_log WHERE entity_type='usuario' AND summary LIKE '%Helena Duarte%'");
  } });
t('D6', 'usuario-editar-acesso', { rota: 'usuarios', ref: 'usuEdit', async preparar(c) { await c.tocar(`[data-editar="${c.s.ids.tecnico}"]`); await c.painel(); } });
t('D6', 'papeis-permissoes', { rota: 'usuarios', ref: 'perms', async preparar(c) { await c.tocar('[data-aba="papeis"]'); await c.dormir(1000); } });
t('D6', 'emails-externos', { rota: 'usuarios', ref: 'ext', async preparar(c) { await c.tocar('[data-aba="emails"]'); await c.dormir(1000); } });
t('D6', 'ver-como-tecnico', { rota: 'usuarios', ref: 'comoTec', async preparar(c) {
  await c.digitar('[data-como]', 'tecnico'); await c.dormir(1500);
  await c.esperar("document.querySelector('.como-faixa')", 6000); await c.dormir(800);
},
// A simulacao fica no sessionStorage da aba e esconde menus e botoes de admin nas capturas seguintes.
async limpar(c) { await c.avaliar("(() => { try { sessionStorage.removeItem('cc_d_como'); } catch (e) {} return true; })()"); } });

// D7 · Fechamento, Historico, Reports e Configuracoes ----------------------------------------
const mesFechadoNum = (c) => Number(c.s.mesFechado.slice(5, 7));
t('D7', 'fechamento', { rota: 'fechamento', ref: 'fech' });
t('D7', 'fechar-com-pendencias', { rota: 'fechamento', ref: 'fechConf', async preparar(c) { await c.tocar('[data-fechar]'); await c.dialogo(); } });
t('D7', 'mes-fechado', { rota: 'fechamento', ref: 'fechOk', async preparar(c) { await c.tocar(`[data-id="${mesFechadoNum(c)}"]`); await c.dormir(900); } });
t('D7', 'reabrir-com-motivo', { rota: 'fechamento', ref: 'reabrir', async preparar(c) { await c.tocar(`[data-id="${mesFechadoNum(c)}"]`); await c.dormir(700); await c.tocar('[data-reabrir]'); await c.dialogo(); } });
t('D7', 'historico', { rota: 'historico', ref: 'hist' });
t('D7', 'historico-fechamentos', { rota: 'historico', ref: 'histFech', async preparar(c) { await c.tocar('[data-seg="tipo"][data-valor="fechamento"]'); await c.dormir(900); } });
t('D7', 'historico-detalhe', { rota: 'historico', ref: 'histDet', async preparar(c) { await c.tocar('tr.rw'); await c.painel(); } });
t('D7', 'reports', { rota: 'reports', ref: 'rep' });
t('D7', 'report-novo', { rota: 'reports', ref: 'repNovo', async preparar(c) { await c.tocar('[data-novo]'); await c.painel(); } });
t('D7', 'report-na-fila', { rota: 'reports', ref: 'repFila', async preparar(c) { await c.tocar('[data-seg="filtro"][data-valor="fila"]'); await c.dormir(800); } });
t('D7', 'report-detalhe', { rota: 'reports', ref: 'repView', async preparar(c) { await c.tocar('tr.rw'); await c.painel(); } });
t('D7', 'config-perfil', { rota: 'config', ref: 'cfg' });
t('D7', 'config-senha-erro', { rota: 'config', ref: 'cfgSenhaErr', async preparar(c) {
  await c.avaliar("(() => { const i = [...document.querySelectorAll('#conteudo input[type=password]')]; const set = (e, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); }; set(i[0], 'senha-errada-123'); set(i[1], 'nova-senha-1234'); set(i[2], 'outra-senha-1234'); })()");
  await c.tocar('[data-trocar]'); await c.dormir(900);
} });
t('D7', 'config-backup', { rota: 'config', ref: 'cfgBackup', async preparar(c) { await c.api('/backup/copias', 'POST', {}, 'admin', 201); await c.tocar('[data-aba="backup"]'); await c.dormir(1200); } });
t('D7', 'config-restaurar', { rota: 'config', ref: 'cfgRestore', async preparar(c) { await c.api('/backup/copias', 'POST', {}, 'admin', 201); await c.tocar('[data-aba="backup"]'); await c.dormir(1200); await c.tocar('[data-restaurar]'); await c.dormir(900); } });
t('D7', 'config-sistema', { rota: 'config', ref: 'cfgSis', async preparar(c) { await c.tocar('[data-aba="sistema"]'); await c.dormir(1500); } });

// Entrar (Rodada 29: o prototipo desta tela nao esta em docs/suite-desktop/prototipo) -----------
t('Login', 'entrar', { como: null, rota: '' });
t('Login', 'entrar-senha-errada', { como: null, rota: '', async preparar(c) {
  await c.digitar('input[type="email"]', 'marina.costa@rcconstrutec.com.br');
  await c.digitar('input[type="password"]', 'senha-errada');
  await c.tocar('button[type="submit"]'); await c.dormir(1500);
} });

module.exports = { catalogo, GRUPOS, t };
