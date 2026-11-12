// Shared by the Chamados adapter and the proposed central Worker integration.
export const APPLICATION = 'chamados';
export const PROTOCOL_VERSION = 1;
export const CAPABILITIES = Object.freeze([
  'chamados.ler', 'chamados.criar', 'chamados.editar', 'chamados.executar', 'chamados.gerir',
  'chamados.read', 'chamados.create', 'chamados.edit', 'chamados.execute', 'chamados.manage',
]);
const ROLES = new Set(['admin', 'gestor', 'financeiro', 'engenharia', 'tecnico', 'comercial']);
const PORTAL_CAPABILITIES = new Set(['chamados.ler', 'chamados.criar', 'chamados.read', 'chamados.create']);
const LEGACY_APPS = ['centro', 'orcamentos'];
const APPS = [...LEGACY_APPS, APPLICATION];

export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function cleanText(value, maximum = 200) {
  return typeof value === 'string' && value === value.trim() && value.length > 0
    && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;
}

export function publicOrigin(value) {
  if (!cleanText(value, 400)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/' && url.origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function validToken(value) {
  // The current central server issues 32 random bytes as unpadded base64.
  return typeof value === 'string' && /^[A-Za-z0-9+/_-]{43}$/.test(value);
}

export function validCode(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function parseSuiteApps(value) {
  if (Array.isArray(value)) return APPS.filter((app) => value.includes(app));
  if (!value) return [...LEGACY_APPS];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parseSuiteApps(parsed) : [...LEGACY_APPS];
  } catch {
    return [...LEGACY_APPS];
  }
}

export function explicitChamadosApp(value) {
  try {
    const apps = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(apps) && apps.includes(APPLICATION);
  } catch {
    return false;
  }
}

function onlyKeys(value, keys) {
  return record(value) && Object.keys(value).every((key) => keys.includes(key));
}

export function validateIdentity(value, organizationId) {
  if (!onlyKeys(value, ['userId', 'name', 'organizationId', 'type', 'suiteRole',
    'capabilities', 'scope', 'active', 'application'])) return undefined;
  if (!cleanText(value.userId, 160) || !cleanText(value.name, 200)
    || !cleanText(value.organizationId, 160) || value.organizationId !== organizationId
    || value.active !== true || value.application !== APPLICATION) return undefined;
  if (!['corporativa', 'portal'].includes(value.type)) return undefined;
  if (value.type === 'corporativa' && !ROLES.has(value.suiteRole)) return undefined;
  if (value.type === 'portal' && value.suiteRole !== null) return undefined;
  const capabilities = value.capabilities;
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.length > CAPABILITIES.length
    || capabilities.some((capability) => !CAPABILITIES.includes(capability))
    || new Set(capabilities).size !== capabilities.length) return undefined;
  if (value.type === 'portal' && capabilities.some((capability) => !PORTAL_CAPABILITIES.has(capability))) return undefined;
  const scope = value.scope;
  if (!onlyKeys(scope, ['restrito', 'clientes', 'somenteAtribuidos'])
    || typeof scope.restrito !== 'boolean' || typeof scope.somenteAtribuidos !== 'boolean'
    || !Array.isArray(scope.clientes) || scope.clientes.length > 1000
    || scope.clientes.some((client) => !cleanText(client, 160))
    || new Set(scope.clientes).size !== scope.clientes.length) return undefined;
  if (!scope.restrito && (scope.clientes.length || scope.somenteAtribuidos)) return undefined;
  if (value.type === 'portal' && (!scope.restrito || !scope.clientes.length || scope.somenteAtribuidos)) return undefined;
  return {
    userId: value.userId, name: value.name, organizationId, type: value.type,
    suiteRole: value.suiteRole, active: true, application: APPLICATION,
    capabilities: [...capabilities].sort(),
    scope: { restrito: scope.restrito, clientes: [...scope.clientes].sort(), somenteAtribuidos: scope.somenteAtribuidos },
  };
}

export function configuration(env) {
  const origin = publicOrigin(env?.CHAMADOS_PUBLIC_ORIGIN);
  const organizationId = cleanText(env?.CHAMADOS_ORGANIZATION_ID, 160);
  const serviceKey = env?.CHAMADOS_SERVICE_KEY;
  if (env?.CHAMADOS_ENABLED !== 'true' || !origin || !organizationId
    || typeof serviceKey !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(serviceKey)) return undefined;
  return { origin, organizationId, serviceKey };
}

export function validEnvelope(value, config, now = Date.now()) {
  if (!record(value) || value.ok !== true || value.invalid === true
    || value.protocolVersion !== PROTOCOL_VERSION || value.application !== APPLICATION
    || value.origin !== config.origin || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= Math.floor(now / 1000)
    || !Number.isSafeInteger(value.grantRevision) || value.grantRevision < 1) return undefined;
  const identity = validateIdentity(value.identity, config.organizationId);
  return identity ? { ...value, identity } : undefined;
}
