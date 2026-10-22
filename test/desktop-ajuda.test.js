const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Central de Ajuda do desktop (/d/): botao no topo (mesmo lugar e icone do Orcamentos), carga dos arquivos e conteudo do app.
const D = path.join(__dirname, '..', 'public', 'd');
const read = (rel) => fs.readFileSync(path.join(D, rel), 'utf8');

test('o topo tem o botao de ajuda logo depois do assistente, em Phosphor', () => {
  const shell = read('shell.js');
  const assistente = shell.indexOf('data-ia');
  const ajuda = shell.indexOf('data-ajuda');
  assert.ok(assistente > 0 && ajuda > assistente, 'ajuda deve vir depois do assistente');
  assert.match(shell, /data-ajuda aria-label="Central de Ajuda"[^>]*>\$\{D\.ic\('question'\)\}/);
  assert.ok(!/data-sino|bell/.test(shell), 'sino fica so no Orçamentos');
});

test('index.html carrega o CSS e o JS da ajuda', () => {
  const html = read('index.html');
  assert.match(html, /css\/ajuda\.css/);
  assert.match(html, /<script src="ajuda\.js"><\/script>/);
});

test('a ajuda fala do Centro de Custos: atalhos reais, regras, perfis, sobre e reportar pelo assistente', () => {
  const js = read('ajuda.js');
  for (const trecho of ['Ctrl', 'Busca rápida', 'Fechamento mensal', 'Comprometido', 'Administrador', 'Gestor', 'Financeiro', 'Engenharia', 'Técnico', 'Comercial', 'Centro de Custos Construtec', 'Reportar problema', "CC.ia.open('Quero reportar um problema no app.')"])
    assert.ok(js.includes(trecho), `falta: ${trecho}`);
  assert.ok(!/lucide/i.test(js));
  assert.ok(!js.includes('Supervisor'), 'o perfil Supervisor não existe mais no modelo da Suíte');
  assert.ok(js.includes('primeiro reabra o fechamento'), 'estorno em mês fechado exige reabrir antes');
  const atalhos = js.slice(js.indexOf('const ATALHOS'), js.indexOf('];', js.indexOf('const ATALHOS')));
  for (const real of ["'K'", "'B'", "'Esc'"]) assert.ok(atalhos.includes(real));
});

test('o dialogo fecha com Esc, prende o foco e devolve o foco ao botao', () => {
  const js = read('ajuda.js');
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /D\.prenderFoco\(camada, event\)/);
  assert.match(js, /anterior\.focus\(\)/);
  assert.match(js, /aria-modal="true"/);
  assert.match(js, /aria-pressed/);
});
