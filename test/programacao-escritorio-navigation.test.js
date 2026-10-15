const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = (file) => fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');

test('desktop exige p5 tanto no menu quanto ao resolver acesso à rota', () => {
  let user = { id: 3, role: 'tecnico', permissoes: ['p2'] };
  const CC = { session: { user: () => user } };
  const context = { window: { CC }, sessionStorage: { getItem: () => null }, document: {}, URLSearchParams };
  vm.runInNewContext(source('d/d-core.js'), context);
  vm.runInNewContext(source('d/shell.js'), context);
  assert.equal(CC.d.pode('programacao'), false);
  assert.equal(CC.d.podeTela('programacao'), false);
  user = { id: 2, role: 'gestor', permissoes: ['p5'] };
  assert.equal(CC.d.pode('programacao'), true);
  assert.equal(CC.d.podeTela('programacao'), true);
  assert.equal(CC.d.itemMenu('programacao').rotulo, 'Programação');
});

test('adaptador desktop entrega a data e a guarda de navegação ao componente comum', async () => {
  const definitions = {};
  let args;
  const CC = { d: { tela: (key, def) => { definitions[key] = def; }, tem: () => true },
    programacaoEscritorio: { mount: async (...values) => { args = values; } } };
  const target = path.join(__dirname, '../public/d/telas/programacao.js');
  if (fs.existsSync(target)) vm.runInNewContext(fs.readFileSync(target, 'utf8'), { window: { CC } });
  assert.ok(definitions.programacao, 'tela registrada');
  const slot = { innerHTML: '' };
  const vivo = () => true;
  await definitions.programacao.render(slot, { query: { dia: '2026-10-18' } }, vivo);
  assert.equal(args[0], slot);
  assert.equal(args[1].dia, '2026-10-18');
  assert.equal(args[1].vivo, vivo);
});

test('adaptador mobile espera permissões e não monta tela atrasada', async () => {
  let finish;
  let mounted = 0;
  const CC = { nav: 8, screens: {}, session: { token: () => 'token' }, render: () => ({}), header: () => '',
    sv: { loadPerms: () => new Promise((resolve) => { finish = resolve; }) },
    programacaoEscritorio: { can: () => true, mount: async () => { mounted++; } } };
  const target = path.join(__dirname, '../public/m/screen-programacao.js');
  if (fs.existsSync(target)) vm.runInNewContext(fs.readFileSync(target, 'utf8'), { window: { CC } });
  assert.ok(CC.screens.programacao, 'tela registrada');
  const pending = CC.screens.programacao({ __nav: 8 });
  CC.nav = 9;
  finish();
  await pending;
  assert.equal(mounted, 0);
});
