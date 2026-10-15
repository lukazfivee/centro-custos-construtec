// O Orçamentos tem autenticação própria. Quando a requisição usa uma sessão
// do Centro, as mesmas restrições do Centro valem antes de encaminhá-la.
const jwt = require('jsonwebtoken');
const { autenticar } = require('./auth');

function centerProxyAccess(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try { jwt.verify(header.slice(7), process.env.JWT_SECRET); }
  catch { return next(); } // A autenticação do destino valida seu próprio token.
  return autenticar(req, res, next);
}

module.exports = { centerProxyAccess };
