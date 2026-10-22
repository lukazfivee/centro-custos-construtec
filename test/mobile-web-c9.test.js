// C9: conferencia do Celular (375 px, tema claro e escuro) contra a Referencia. Correcoes de acabamento.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = path.join(__dirname, '..', 'public', 'm');
const read = (file) => fs.readFileSync(path.join(M, file), 'utf8');
const allCss = () => ['m.css', 'fin.css', 'adm.css', 'servico.css', 'barra.css', 'obra-tec.css', 'anim.css'].map(read).join('\n');

test('colunas lado a lado nao estouram com campo de data (Editar dados da cobranca)', () => {
  const m = read('m.css');
  assert.match(m, /\.grid2 \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'coluna 1fr cresce com o campo de data e passa da margem');
  assert.match(m, /\.field input, \.field select, \.field textarea \{[^}]*min-width: 0/);
});

test('etiqueta verde (.tag.ok) tem versao para o tema escuro', () => {
  assert.match(allCss(), /html\[data-theme="escuro"\] \.tag\.ok/, 'sem isso a etiqueta Aberto/Ativo fica clara demais no escuro');
});

test('Obras: o cabecalho cabe a marca inteira (Novo vira so o icone)', () => {
  const home = read('screen-home.js');
  assert.match(home, /id="novo" aria-label="Novo/, 'botao Novo precisa de nome acessivel ao virar icone');
  assert.doesNotMatch(home, /icon\('plus', 16\)\}Novo<\/button>/);
  assert.match(read('servico.css'), /\.sv-novo \{[^}]*width: 44px/);
});

test('Historico: o filtro de pessoa cabe na meia coluna sem cortar o texto', () => {
  assert.doesNotMatch(read('screen-historico.js'), /'Todas as pessoas'/);
});

test('Menu: Versao completa nao promete como exclusivo do computador o que o celular ja faz', () => {
  const misc = read('screen-misc.js');
  assert.doesNotMatch(misc, /Fechamento, cobranças, cadastros e usuários \(tela de computador\)/);
  assert.match(misc, /Versão completa<small>[^<]*computador/);
});

test('service worker do Celular foi atualizado depois das correcoes do C9', () => {
  const n = Number(read('sw.js').match(/cc-celular-v(\d+)/)[1]);
  assert.ok(n >= 23, `CACHE ainda em v${n}`);
});

test('botao do assistente nao cobre o fim do conteudo (reserva de espaco com e sem barra de acoes)', () => {
  const barra = read('barra.css');
  // D1: reserva a altura do botão + 16 px no fim da rolagem; em tela com barra de ações o botão some.
  assert.match(barra, /body:has\(\.ia-fab:not\(\[hidden\]\)\):not\(:has\(\.actions\)\) \{ padding-bottom: calc\(var\(--barra-topo\) \+ 82px\)/);
  assert.match(barra, /body\.no-tabs:has\(\.ia-fab:not\(\[hidden\]\)\):not\(:has\(\.actions\)\) \{ padding-bottom: calc\(var\(--sab\) \+ 84px\)/);
  assert.match(barra, /body:has\(\.actions\) \.ia-fab \{ display: none; \}/);
});
