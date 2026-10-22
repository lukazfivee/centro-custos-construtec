const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Ajuda do celular (/m/): item no Menu, tela registrada e carregada, cache renovado e conteudo coerente com o desktop.
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('o Menu do celular tem o item Ajuda e a tela esta carregada, no cache e liberada ao tecnico', () => {
  const menu = read('public/m/screen-misc.js');
  assert.match(menu, /id="m-ajuda">\$\{icon\('question', 22\)\}/);
  assert.match(menu, /CC\.go\('ajuda'\)/);
  assert.match(read('public/m/index.html'), /screen-ajuda\.js/);
  assert.match(read('public/m/sw.js'), /'screen-ajuda\.js'/);
  assert.match(read('public/m/sw.js'), /'ajuda\.css'/);
  assert.match(read('public/m/index.html'), /href="ajuda\.css"/);
  const app = read('public/m/app.js');
  assert.match(app, /'atualizacao', 'ajuda', 'report-novo'\]\)/);
  assert.match(app, /'perfil', 'ajuda', 'fechamento'/);
});

test('a ajuda do celular diz o mesmo que a do desktop sobre fechamento e perfis, sem o Supervisor antigo', () => {
  const js = read('public/m/screen-ajuda.js');
  for (const t of ['Administrador', 'Gestor', 'Financeiro', 'Engenharia', 'Técnico', 'Comercial', 'primeiro é preciso reabrir o fechamento', "CC.ia.open('Quero reportar um problema no app.')"]) assert.ok(js.includes(t), t);
  assert.ok(!js.includes('Supervisor'));
  const desktop = read('public/d/ajuda.js');
  for (const [, nome] of desktop.matchAll(/\['[a-z-]+', '([A-ZÀ-Ú][a-zà-ú]+)', '/g)) if (['Administrador', 'Gestor', 'Financeiro', 'Engenharia', 'Técnico', 'Comercial'].includes(nome)) assert.ok(js.includes(`'${nome}'`), nome);
});

test('o item Ajuda fica fora do bloco que só existe com o assistente pronto', () => {
  const menu = read('public/m/screen-misc.js');
  const ajuda = menu.indexOf('id="m-ajuda"');
  const bloco = menu.indexOf('${CC.ia && CC.ia.ready() ?');
  assert.ok(ajuda > 0 && bloco > 0 && ajuda < bloco, 'Ajuda deve vir antes do bloco condicional do assistente');
});
