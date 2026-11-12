// Papéis e permissões da Suíte (D6 do desktop do Centro de Custos).
// O papel legado (`role`: admin|gestor|supervisor) continua na tabela para o
// Orçamentos e para clientes antigos; `suite_role` é o papel novo. Sempre que o
// papel novo é gravado, o legado é derivado dele.

export const SUITE_ROLES = ['admin', 'dev', 'gestor', 'financeiro', 'engenharia', 'tecnico', 'comercial'];
export const SUITE_APPS = ['centro', 'orcamentos'];

// Ordem e valores de docs/suite-desktop/01-ESPEC-TELAS.md, seção 6.
const MATRIX = {
  p1: ['admin', 'dev', 'gestor', 'financeiro', 'engenharia'],
  p2: ['admin', 'dev', 'gestor', 'financeiro', 'engenharia', 'tecnico'],
  p3: ['admin', 'dev', 'gestor', 'financeiro'],
  p4: ['admin', 'dev', 'gestor', 'financeiro'],
  p5: ['admin', 'dev', 'gestor'],
  p6: ['admin', 'dev', 'gestor', 'financeiro'],
  p7: ['admin', 'dev', 'gestor'],
  p8: ['admin', 'dev'],
  p9: ['admin', 'dev'],
  p10: ['admin', 'dev', 'gestor', 'engenharia', 'comercial'],
  p11: ['admin', 'dev', 'gestor', 'comercial'],
  p12: ['admin', 'dev', 'gestor', 'engenharia', 'tecnico'],
};
export const PERMISSIONS = Object.keys(MATRIX);

export function validSuiteRole(value) {
  return SUITE_ROLES.includes(String(value ?? '').trim());
}

export function legacyRoleFor(suiteRole) {
  if (suiteRole === 'admin' || suiteRole === 'dev') return 'admin';
  if (suiteRole === 'gestor') return 'gestor';
  return 'supervisor';
}

// Conta nova sem papel escolhido: admin e gestor seguem o papel antigo; o resto entra como tecnico.
export function suiteFromLegacy(role) {
  return role === 'admin' || role === 'gestor' ? role : 'tecnico';
}

export function effectiveSuiteRole(row) {
  if (validSuiteRole(row?.suite_role)) return row.suite_role;
  if (row?.role === 'admin') return 'admin';
  if (row?.role === 'gestor') return 'gestor';
  return 'tecnico';
}

export function parseApps(value) {
  if (Array.isArray(value)) return SUITE_APPS.filter((app) => value.includes(app));
  if (!value) return [...SUITE_APPS];
  try { return parseApps(JSON.parse(value)); } catch { return [...SUITE_APPS]; }
}

export function normalizeApps(value) {
  if (!Array.isArray(value)) return null;
  const apps = SUITE_APPS.filter((app) => value.includes(app));
  return apps.length ? apps : null;
}

export function defaultMatrix() {
  const out = {};
  for (const role of SUITE_ROLES) {
    out[role] = {};
    for (const p of PERMISSIONS) out[role][p] = MATRIX[p].includes(role);
  }
  return out;
}

// Padrão + diferenças gravadas. Admin e dev ficam sempre com tudo.
export function applyOverrides(rows) {
  const matrix = defaultMatrix();
  for (const row of rows || []) {
    if (row.role === 'admin' || row.role === 'dev' || !matrix[row.role] || !(row.permission in matrix[row.role])) continue;
    matrix[row.role][row.permission] = Boolean(row.allowed);
  }
  for (const p of PERMISSIONS) { matrix.admin[p] = true; matrix.dev[p] = true; }
  return matrix;
}

export async function loadMatrix(env) {
  const rows = (await env.DB.prepare('SELECT role,permission,allowed FROM role_permission_overrides').all()).results || [];
  return applyOverrides(rows);
}
