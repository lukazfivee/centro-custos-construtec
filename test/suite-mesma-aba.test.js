const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Orçamentos, Centro de Custos e Chamados se abrem sempre na mesma aba; só o Webmail (UOL) abre em outra.
const MENUS = [
  'public/d/suite.js', 'public/m/suite.js', 'public/suite/index.html', 'public/index.html',
  'cloudflare/center-container/chamados/worker/navigation-ui.js',
  'cloudflare/center-container/chamados/worker/navigation-assets.js',
  'cloudflare/center-container/chamados/worker/suite-launcher-assets.js',
];

test('Suite: a troca entre os sistemas nunca abre aba nova (só o webmail)', () => {
  for (const file of MENUS) {
    const semWebmail = read(file).split('\n').filter((line) => !/webmail/i.test(line)).join('\n');
    assert.doesNotMatch(semWebmail, /window\.open\(|target=["']_blank|\.target\s*=\s*["']_blank|_blank['"]\s*\)/, file);
  }
});

test('Suite desktop: o Chamados entra pela mesma aba com o código de uso único', () => {
  const menu = read('public/d/suite.js');
  assert.match(menu, /location\.assign\(origin \+ '\/#handoff=' \+ data\.code\)/);
  assert.doesNotMatch(menu, /const popup|popup\?\.|popup\./);
});
