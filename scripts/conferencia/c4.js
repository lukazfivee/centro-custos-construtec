// C4: Usuarios, seis papeis, convites e simulacao. Reutiliza o motor e o banco ficticio do C1.
require('./c4-isolamento');
const assert = require('node:assert/strict');
const path = require('node:path');
const { catalogo, t } = require('./telas');
const cdp = require('./cdp');
const papeis = ['admin', 'gestor', 'financeiro', 'engenharia', 'tecnico', 'comercial'];
const raiz = path.resolve(__dirname, '../..');
const pasta = path.join(raiz, 'docs/suite-desktop/validacao/C4');

async function conferir(c, expressao, mensagem) {
  assert.ok(await c.esperar(expressao, 8000), mensagem);
}
async function lista(c) {
  await conferir(c, "document.querySelector('[data-editar]')", 'Lista de usuarios nao carregou');
}
async function matriz(c) {
  await c.tocar('[data-aba="papeis"]');
  await conferir(c, "document.querySelectorAll('.usu-matriz [data-perm]').length === 60", 'Matriz incompleta');
  assert.equal(await c.avaliar("document.querySelectorAll('.usu-matriz .trava').length"), 12);
}
async function formulario(c, papel, editar = false) {
  await lista(c);
  await c.tocar(editar ? `[data-editar="${c.s.ids[papel]}"]` : '[data-novo]');
  await c.painel();
  if (!editar) await c.digitar('.drawer [name="suiteRole"]', papel);
  await conferir(c, "document.querySelectorAll('.usu-pode li').length === 12", 'Resumo de permissoes incompleto');
  assert.equal(await c.avaliar("document.querySelector('.drawer [name=suiteRole]').options.length"), 6);
  assert.equal(await c.avaliar("document.querySelector('.drawer [name=suiteRole]').value"), papel);
  if (editar) assert.ok(await c.avaliar("['nome','email'].every(n => document.querySelector('.drawer [name='+n+']').disabled)"));
}

// Apenas respostas do frontend: o servidor segue local, sem conta corporativa e sem e-mail.
// Recarregar a pagina descarta o mock; nao modifica rotas, banco ou permissoes reais.
async function corporativo(c, misto = false) {
  await lista(c);
  await c.avaliar(`(async () => {
    const original = CC.api;
    const base = (await original('/usuarios/permissoes')).data;
    const padrao = structuredClone(base.matriz);
    let dados = { ...base, somenteLeitura: false, matriz: structuredClone(padrao) };
    const convites = ${misto} ? [{ email: 'convite.c4@exemplo.invalid', suiteRole: 'tecnico' }] : [];
    window.c4Chamadas = [];
    CC.api = async (rota, op = {}) => {
      if (rota === '/cadastros') return { data: { code: 'C4-FICTICIO', invites: convites } };
      if (rota === '/cadastros/convites') {
        window.c4Chamadas.push({ rota, body: op.body });
        if (!convites.some(c => c.email === op.body.email)) convites.push({ email: op.body.email, suiteRole: op.body.papel });
        return { data: { code: 'C4-FICTICIO' } };
      }
      if (rota === '/usuarios/permissoes') {
        if (op.method === 'POST') {
          window.c4Chamadas.push({ rota, body: op.body });
          dados.matriz[op.body.papel][op.body.permissao] = op.body.permitido;
        }
        return { data: structuredClone(dados) };
      }
      if (rota === '/usuarios/permissoes/restaurar') {
        dados.matriz = structuredClone(padrao);
        return { data: structuredClone(dados) };
      }
      const resposta = await original(rota, op);
      if (${misto} && rota === '/usuarios') {
        const itens = Array.isArray(resposta.data) ? resposta.data : resposta.data.itens;
        itens.forEach(u => { if (u.suiteRole === 'comercial') u.ativo = false; });
      }
      return resposta;
    };
    CC.d.usu.guardarMatriz(dados);
  })()`);
  await c.ir('inicio');
  await c.ir('usuarios');
  await lista(c);
  await conferir(c, "document.querySelector('[data-novo]').textContent.includes('Convidar')", 'Convite corporativo nao apareceu');
}

// Preserva os estados locais do C1, inclusive criacao por senha em banco descartavel.
const originais = catalogo.filter(x => x.grupo === 'D6');
catalogo.splice(0, catalogo.length, ...originais);
const tecnico = catalogo.find(x => x.id === 'ver-como-tecnico');
const prepararTecnico = tecnico.preparar;
tecnico.preparar = async c => { await prepararTecnico(c); await conferirSimulacao(c, 'tecnico'); };
catalogo.find(x => x.id === 'papeis-permissoes').preparar = async c => {
  await matriz(c);
  assert.equal(await c.avaliar("document.querySelectorAll('.usu-matriz [data-perm]:disabled').length"), 60);
  assert.ok(await c.avaliar("document.querySelector('[data-restaurar]').disabled"));
};
catalogo.find(x => x.id === 'usuario-editar-acesso').preparar = c => formulario(c, 'tecnico', true);
const criado = catalogo.find(x => x.id === 'usuario-criado');
const criar = criado.preparar;
criado.preparar = async c => {
  await criar(c);
  await conferir(c, "document.querySelector('#drw-tit')?.textContent === 'Usuário criado'", 'Cabecalho nao confirmou criacao');
};
for (const papel of papeis) {
  t('D6', `acesso-${papel}`, { rota: 'usuarios', como: papel, ref: papel === 'admin' ? 'usu' : undefined,
    async preparar(c) {
      if (papel === 'admin') return lista(c);
      await conferir(c, `window.CC?.d?.usuario().suiteRole === '${papel}'`, 'Sessao nao carregou o papel real');
      await conferir(c, "document.querySelector('#conteudo').textContent.includes('Sem acesso')", 'Papel sem p9 abriu administracao');
      assert.equal(await c.avaliar("document.querySelectorAll('[data-novo], [data-editar], [data-como], [data-perm]').length"), 0);
    } });
  if (papel !== 'tecnico') t('D6', `editar-${papel}`, { rota: 'usuarios', ref: 'usuEdit',
    preparar: c => formulario(c, papel, true) });
  t('D6', `senha-${papel}`, { rota: 'usuarios', ref: 'convite', preparar: c => formulario(c, papel) });
  t('D6', `convite-${papel}`, { rota: 'usuarios', ref: 'convite', async preparar(c) {
    await corporativo(c);
    await formulario(c, papel);
    await c.digitar('.drawer [name="nome"]', 'Pessoa de exemplo C4');
    await c.digitar('.drawer [name="email"]', `convite.${papel}@exemplo.invalid`);
    assert.ok(await c.avaliar("document.querySelector('[data-senha-wrap]').hidden"));
  } });
  if (papel !== 'tecnico') t('D6', `ver-como-${papel}`, { rota: 'usuarios', ref: papel === 'admin' ? 'usu' : undefined,
    async preparar(c) {
      await lista(c);
      await c.digitar('[data-como]', papel);
      await conferirSimulacao(c, papel);
    }, limpar: limparSimulacao });
}
async function conferirSimulacao(c, papel) {
  await conferir(c, `window.CC?.d?.papelSuite() === '${papel}' && CC.d.usuario().suiteRole === 'admin' && location.hash === '#/inicio'`, 'Simulacao nao mudou o papel e a rota');
  await conferir(c, "document.querySelector('#conteudo')?.children.length > 0", 'Inicio nao carregou');
  assert.equal(await c.avaliar("!!document.querySelector('.como-faixa')"), papel !== 'admin');
  assert.equal(await c.avaliar("CC.d.usuario().suiteRole"), 'admin', 'Simulacao alterou a identidade real');
  if (papel !== 'admin') assert.ok(await c.avaliar("document.querySelector('.top').getBoundingClientRect().bottom <= document.querySelector('.como-faixa').getBoundingClientRect().top"), 'Faixa de simulacao ficou acima do topo');
}
async function limparSimulacao(c) { await c.avaliar("sessionStorage.removeItem('cc_d_como')"); }
t('D6', 'ver-como-retorno', { rota: 'usuarios', ref: 'usu', async preparar(c) {
  await lista(c);
  await c.digitar('[data-como]', 'tecnico');
  await conferirSimulacao(c, 'tecnico');
  await c.tocar('[data-sair-como]');
  await lista(c);
  assert.ok(await c.avaliar("!CC.d.simulando() && !document.querySelector('.como-faixa')"));
}, limpar: limparSimulacao });
t('D6', 'papeis-final', { rota: 'usuarios', ref: 'perms', async preparar(c) {
  await matriz(c); await c.rolar('#conteudo');
} });
t('D6', 'papeis-editavel-simulado', { rota: 'usuarios', ref: 'perms', async preparar(c) {
  await corporativo(c); await matriz(c);
  const sel = '[data-perm="p3"][data-papel="gestor"]';
  const antes = await c.avaliar(`document.querySelector('${sel}').getAttribute('aria-checked')`);
  await c.tocar(sel);
  await conferir(c, `document.querySelector('${sel}').getAttribute('aria-checked') !== '${antes}'`, 'Matriz nao repintou');
  assert.equal(await c.avaliar('window.c4Chamadas.length'), 1);
} });
t('D6', 'papeis-restaurar', { rota: 'usuarios', ref: 'perms', async preparar(c) {
  await corporativo(c); await matriz(c); await c.tocar('[data-restaurar]'); await c.dialogo();
} });
for (const filtro of ['todos', 'ativos', 'convites', 'desativados']) {
  t('D6', `lista-${filtro}-simulada`, { rota: 'usuarios', ref: 'usu', async preparar(c) {
    await corporativo(c, true);
    await c.tocar(`[data-seg="filtro"][data-valor="${filtro}"]`);
    assert.equal(await c.avaliar("document.querySelectorAll('[data-tabela] tbody tr').length"), { todos: 7, ativos: 5, convites: 1, desativados: 1 }[filtro]);
  } });
}
t('D6', 'lista-vazia', { rota: 'usuarios', ref: 'usu', async preparar(c) {
  await lista(c); await c.digitar('[data-busca]', 'nenhuma-pessoa-c4');
  await conferir(c, "document.querySelector('[data-tabela]').textContent.includes('Nenhum usuário')", 'Busca vazia nao apareceu');
} });
t('D6', 'convite-enviado-simulado', { rota: 'usuarios', ref: 'conviteOk', async preparar(c) {
  await corporativo(c); await formulario(c, 'tecnico');
  await c.digitar('.drawer [name="email"]', 'novo.c4@exemplo.invalid');
  await c.tocar('.drawer [data-salvar]');
  await conferir(c, "document.querySelector('.drawer .dcorpo').textContent.includes('Convite enviado')", 'Sucesso do convite ausente');
  assert.equal(await c.avaliar("document.querySelector('#drw-tit').textContent"), 'Convite enviado');
  assert.deepEqual(await c.avaliar('window.c4Chamadas[0].body'), { email: 'novo.c4@exemplo.invalid', papel: 'tecnico', apps: ['orcamentos', 'centro'] });
} });
t('D6', 'convite-reenviado-simulado', { rota: 'usuarios', ref: 'usu', async preparar(c) {
  await corporativo(c, true); await c.tocar('[data-reenviar]');
  assert.deepEqual(await c.avaliar('window.c4Chamadas[0].body'), { email: 'convite.c4@exemplo.invalid', papel: 'tecnico' });
} });
t('D6', 'usuario-erros', { rota: 'usuarios', ref: 'convite', async preparar(c) {
  await formulario(c, 'tecnico'); await c.tocar('.drawer [data-salvar]');
  await conferir(c, "document.querySelectorAll('.drawer .fld.tem-erro').length === 3", 'Erros de nome, email e senha ausentes');
} });
t('D6', 'editar-obras-todas', { rota: 'usuarios', ref: 'usuEdit', async preparar(c) {
  await formulario(c, 'tecnico', true); await c.tocar('[data-seg="obras"][data-valor="todas"]');
  assert.ok(await c.avaliar("getComputedStyle(document.querySelector('[data-lista-obras]')).display === 'none'"));
} });
t('D6', 'editar-final', { rota: 'usuarios', ref: 'usuEdit', async preparar(c) {
  await formulario(c, 'tecnico', true); await c.rolar('.drawer .dcorpo');
} });

// O C1 sonda a pagina; C4 acrescenta cortes e rolagens internas, inclusive no drawer.
for (const tela of catalogo) {
  const preparar = tela.preparar;
  tela.preparar = async c => {
    if (preparar) await preparar(c);
    else await lista(c);
    const falhas = await c.avaliar(`(() => {
      const falhas = [];
      for (const raiz of document.querySelectorAll('#conteudo, .drawer .dcorpo')) {
        if (raiz.scrollWidth > raiz.clientWidth + 2) falhas.push('horizontal: ' + raiz.className);
        for (const e of raiz.querySelectorAll('*')) {
          if (!e.getClientRects().length || e.closest('[hidden]')) continue;
          const cs = getComputedStyle(e);
          if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && !['SELECT','TEXTAREA'].includes(e.tagName)) falhas.push('rolagem interna: ' + e.className);
          if (/(hidden|clip)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2) falhas.push('corte: ' + e.className);
        }
      }
      const rod = document.querySelector('.drawer .drod')?.getBoundingClientRect();
      if (rod && (rod.bottom > innerHeight + 1 || rod.right > innerWidth + 1)) falhas.push('rodape fora da janela');
      const tabela = document.querySelector('.usu-matriz, .usu-lista .tbl');
      if (tabela && tabela.getBoundingClientRect().right > innerWidth + 1) falhas.push('tabela fora da janela');
      return falhas;
    })()`);
    assert.deepEqual(falhas, [], 'Corte ou rolagem aninhada');
  };
}

const args = process.argv.slice(2);
assert.ok(!args.includes('--validacao'), 'C4 nao sobrescreve evidencias D6 do C1');
if (!args.includes('--porta')) process.argv.push('--porta', '3161');
assert.equal(process.argv[process.argv.indexOf('--porta') + 1], '3161', 'C4 usa app 3161, Chrome 3162, Referencia 3163, extras 3164-3165');
if (!args.includes('--tamanhos')) process.argv.push('--tamanhos', '1280x720,1280x800,1440x900');
if (!args.includes('--saida')) process.argv.push('--saida', path.join(pasta, 'depois'));
const saida = path.resolve(process.argv[process.argv.indexOf('--saida') + 1]);
assert.ok(saida.startsWith(pasta + path.sep), 'Saida deve ficar dentro de validacao/C4');
(async () => {
  if (!args.includes('--listar')) {
    const chrome = await cdp.abrirChrome({ porta: 3162 });
    await chrome.encerrar();
  }
  require('./conferir');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
