// Dev: papel da Suite que tem tudo do admin e troca a senha de todos os perfis abaixo dele.
const { suiteRoleOf } = require('./permissions');
const { httpError } = require('../lib/http');

const isDev = (user) => Boolean(user) && suiteRoleOf(user) === 'dev';

// So um dev concede o papel dev ou mexe em outro dev.
function assertDevGrant(actor, { toRole, target } = {}) {
  if (isDev(actor)) return;
  if (toRole === 'dev' || (target && suiteRoleOf(target) === 'dev')) {
    throw httpError(403, 'Somente um dev pode conceder ou alterar o papel dev.');
  }
}

module.exports = { isDev, assertDevGrant };
