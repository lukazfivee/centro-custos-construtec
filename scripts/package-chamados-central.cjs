const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = 'c0bef4acb82ec38ac02d000499eb73418bae661a';
const target = process.argv[2];
if (!target || !path.isAbsolute(target)) throw new Error('Pass an absolute integrations/central destination.');
const evidence = 'docs/verificacao/chamados-central-20261017';
const logFiles = [
  ['chamados-full-test-final.log', 'npm-test-final.txt'],
  ['chamados-legacy-access-test.log', 'legacy-access-test.txt'],
  ['chamados-syntax-check-final.log', 'syntax-check-final.txt'],
  ['chamados-focused-final.log', 'focused-tests-final.txt'],
  ['chamados-regression-fix.log', 'regression-fixes.txt'],
];
function decode(bytes) {
  if (bytes[0] === 255 && bytes[1] === 254) return bytes.subarray(2).toString('utf16le');
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}
const logTexts = {};
fs.mkdirSync(path.join(root, evidence), { recursive: true });
for (const [source, destination] of logFiles) {
  const text = decode(fs.readFileSync(path.join(root, source)));
  logTexts[destination] = text;
  fs.writeFileSync(path.join(root, evidence, destination), text);
}
if (!/tests 490\b/.test(logTexts['npm-test-final.txt']) || !/fail 0\b/.test(logTexts['npm-test-final.txt'])) throw new Error('Full test gate not proven.');
if (!/tests 10\b/.test(logTexts['legacy-access-test.txt']) || !/fail 0\b/.test(logTexts['legacy-access-test.txt'])) throw new Error('Legacy gate not proven.');
if (!/238 arquivos JavaScript verificados/.test(logTexts['syntax-check-final.txt'])) throw new Error('Syntax gate not proven.');
const summary = {
  generatedAt: new Date().toISOString(), baseline, branch: 'feat/chamados-cloudflare-20261017',
  fullSuite: { tests: 490, pass: 490, fail: 0, durationMs: 503128.4534 },
  additionalLegacyAccessTests: { tests: 10, pass: 10, fail: 0, discovery: 'After the full suite started; executed separately.' },
  syntax: { javascriptFiles: 238, exitCode: 0 },
  focusedCentralTests: 38, operationalOutboxRelayTests: 4,
  ui: { widths: [1440, 390], flow: ['login', 'grant', 'portal scope', 'revoke', 'logout'], navigation: ['desktop', 'mobile'], overflow: false, consoleErrors: 0 },
  liveCompatibility: { legacyAppsUpdateSignatureOccurrences: 1, containerRebuild: false, deployment: 'Additive overlay around preserved live Worker module.' },
  emailSentByVerification: false,
};
fs.writeFileSync(path.join(root, evidence, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const doc = path.join(root, 'docs/CHAMADOS-CENTRAL-20261017.md');
fs.writeFileSync(doc, fs.readFileSync(doc, 'utf8').replace(
  '- Evidências em docs/verificacao/chamados-central-20261017. Resultados da regressão completa da Suíte serão consolidados com o log final.',
  '- Regressão completa: 490/490 aprovados, sem falhas (503 segundos), mais os 10 testes do shim executados depois da descoberta da suíte: 500 testes aprovados ao todo. npm run check passou com 238 arquivos JavaScript. Evidências e resumo em docs/verificacao/chamados-central-20261017.'
));
const files = [
  'cloudflare/center-container/index.js', 'cloudflare/center-container/loginGuard.js',
  'cloudflare/center-container/sessionHandoff.js', 'cloudflare/center-container/suiteRoles.js',
  'desktop/main-unified.js', 'desktop/suite-modules.js', 'desktop/chamados-navigation.cjs',
  'package.json', 'public/d/suite.js', 'routes/auth.js', 'routes/usersAccess.js',
  'services/userAccess.js', 'services/chamadosAccessAdmin.cjs', 'services/chamadosSuite.cjs',
  'test/session-handoff-orcamentos.test.js', 'test/suite-desktop.test.js',
  'cloudflare/center-container/d1-migrations/014-chamados-access.sql',
  'cloudflare/center-container/d1-migrations/015-chamados-grant-audit.sql',
  'cloudflare/center-container/d1-migrations/016-chamados-notification-receipts.sql',
  'cloudflare/center-container/chamados/protocol.js',
  'cloudflare/center-container/chamados/deployment/entry.js',
  'cloudflare/center-container/chamados/deployment/build.cjs',
  'cloudflare/center-container/chamados/deployment/README.md',
  'docs/CHAMADOS-CENTRAL-20261017.md', 'scripts/build-chamados-central-assets.cjs',
  'scripts/chamados-admin-qa.cjs', 'scripts/package-chamados-central.cjs',
];
function addTree(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = relative + '/' + entry.name;
    if (entry.isDirectory()) addTree(name); else files.push(name);
  }
}
addTree('cloudflare/center-container/chamados/worker');
addTree(evidence);
for (const name of fs.readdirSync(path.join(root, 'test'))) if (/^chamados-.*\.(cjs|js)$/.test(name)) files.push('test/' + name);
const selected = [...new Set(files)].sort();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chamados-central-package-'));
function git(args, index) {
  const result = cp.spawnSync('git', args, { cwd: root, env: { ...process.env, GIT_INDEX_FILE: index }, maxBuffer: 50 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('git ' + args[0] + ' failed: ' + result.stderr.toString());
  return result.stdout;
}
try {
  const index = path.join(temp, 'package-index'), verify = path.join(temp, 'verify-index');
  git(['read-tree', baseline], index);
  git(['add', '--', ...selected], index);
  const patch = git(['diff', '--cached', '--binary', baseline, '--', ...selected], index);
  fs.mkdirSync(target, { recursive: true });
  const patchName = 'central-integration-20261017.patch';
  const patchPath = path.join(target, patchName);
  fs.writeFileSync(patchPath, patch);
  git(['read-tree', baseline], verify);
  git(['apply', '--cached', '--check', patchPath], verify);
  const manifest = { ...summary, patch: patchName, bytes: patch.length,
    sha256: crypto.createHash('sha256').update(patch).digest('hex'),
    sourceFiles: selected, excluded: ['preserved live Worker module and financial backups (remain on the deployment machine)', 'ignored config/secrets', 'node_modules'],
    applyCheck: 'git apply --cached --check succeeded against a temporary index at baseline; the real Git index was untouched.' };
  fs.writeFileSync(path.join(target, 'central-integration-20261017.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ patch: patchPath, bytes: patch.length, sha256: manifest.sha256, files: selected.length, applyCheck: true, tests: 500, syntaxFiles: 238 }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
