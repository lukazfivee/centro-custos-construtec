const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('desktop: Logística usa p5 e traz resumo, inventário, kits e conferência inicial', () => {
  const shell = read('public/d/shell.js');
  const html = read('public/d/index.html');
  const screen = read('public/d/telas/logistica.js');
  assert.match(shell, /\['logistica',[^\]]*'Logística',[^\]]*'logistica'/);
  assert.match(read('public/d/d-core.js'), /logistica: \(\) => D\.tem\('p5'\)/);
  assert.match(html, /telas\/logistica\.js/);
  assert.match(html, /css\/logistica\.css/);
  for (const text of ['Resumo', 'Ferramentas', 'Kits dos técnicos', 'Conferência inicial', 'Movimentações', 'Abaixo do mínimo', 'Materiais', 'Solicitações', 'Registrar devolução', 'Faltas']) {
    assert.ok(screen.includes(text), `falta ${text}`);
  }
  assert.match(screen, /\/logistica\/resumo/);
  assert.match(screen, /\/logistica\/ferramentas/);
  assert.match(screen, /\/logistica\/kits\/padrao/);
  assert.match(screen, /\/logistica\/conferencias-iniciais/);
  assert.match(screen, /window\.print\(\)/);
  assert.match(screen, /\/logistica\/materiais\/entregas/);
  assert.match(screen, /\/logistica\/materiais\/devolucoes-pendentes/);
  assert.match(screen, /\/logistica\/materiais\/devolucoes/);
  assert.match(screen, /Devoluções pendentes/);
  assert.match(screen, /\/logistica\/faltas/);
});
