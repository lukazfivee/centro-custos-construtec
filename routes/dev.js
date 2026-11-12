// Ferramentas do dev no Centro: ponte para o diretorio central (auditoria, sessoes, desbloqueio)
// e "ver como", que emite um JWT curto na pele de outra conta. So o dev, e nunca dentro de um "ver como".
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb, getInstanceIdentity } = require('../db');
const { autenticar } = require('../middleware/auth');
const { asyncRoute, httpError } = require('../lib/http');
const cloudAuth = require('../services/cloudAuth');
const { mirrorCloudUser } = require('../services/cloudUserMirror');
const { appAllowed, APP_DENIED_MESSAGE } = require('../services/appAccess');
const { isDev } = require('../services/programmer');
const { markCloudSessionDead } = require('../services/cloudSessionCheck');

const router = express.Router();
router.use(autenticar);

const VER_COMO_EXPIRA = '30m';

function exigirDev(req, _res, next) {
  if (!isDev(req.usuario) || req.verComo) return next(httpError(403, 'Somente o dev, na própria conta, usa estas ferramentas.'));
  if (!req.usuario.cloud_managed || !req.usuario.cloud_session_token) {
    return next(httpError(400, 'As ferramentas de dev exigem login corporativo.'));
  }
  return next();
}

function falha(error, padrao) {
  if ([400, 401, 403, 404, 409, 429, 503].includes(error.status)) return httpError(error.status, error.message);
  return httpError(503, padrao);
}

async function viaNuvem(req, caminho, payload, padrao) {
  try { return await cloudAuth.devCall(req.usuario.cloud_session_token, caminho, payload); }
  catch (error) { throw error.statusCode ? error : falha(error, padrao); }
}

function emailDe(req) {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!email) throw httpError(400, 'Informe o e-mail da conta.');
  return email;
}

router.get('/auditoria', exigirDev, asyncRoute(async (req, res) => {
  res.json(await viaNuvem(req, 'audit', undefined, 'Não foi possível carregar a auditoria agora.'));
}));

router.get('/sessoes', exigirDev, asyncRoute(async (req, res) => {
  res.json(await viaNuvem(req, 'sessions', undefined, 'Não foi possível carregar as sessões agora.'));
}));

router.post('/sessoes/derrubar', exigirDev, asyncRoute(async (req, res) => {
  res.json(await viaNuvem(req, 'sessions/revoke', { email: emailDe(req) }, 'Não foi possível derrubar as sessões agora.'));
}));

router.post('/usuarios/desbloquear', exigirDev, asyncRoute(async (req, res) => {
  res.json(await viaNuvem(req, 'users/unlock', { email: emailDe(req) }, 'Não foi possível desbloquear o login agora.'));
}));

// A sessao central do alvo vale 30 minutos; o JWT local leva o hash dela (como no handoff) e a marca do dev.
router.post('/ver-como', exigirDev, asyncRoute(async (req, res) => {
  const remote = await viaNuvem(req, 'impersonate', { email: emailDe(req) }, 'Não foi possível abrir o ver como agora.');
  if (!remote?.sessionToken || !remote?.user) throw httpError(502, 'O diretório central não devolveu a sessão.');
  const user = await mirrorCloudUser(getDb(), remote.user);
  if (!appAllowed(user, 'centro')) throw httpError(403, APP_DENIED_MESSAGE);
  const centralSessionHash = crypto.createHash('sha256').update(remote.sessionToken).digest('hex');
  const token = jwt.sign({ centralSessionHash, verComo: req.usuario.email }, process.env.JWT_SECRET,
    { subject: String(user.id), expiresIn: VER_COMO_EXPIRA });
  res.json({
    token,
    usuario: { id: user.id, nome: user.name, email: user.email, role: user.role },
    verComo: req.usuario.email,
    expiraEm: remote.expiresAt,
    instancia: getInstanceIdentity(),
  });
}));

// Chamada com o JWT do "ver como": encerra a sessao central do alvo. O dev volta com o token que guardou.
router.post('/ver-como/fim', asyncRoute(async (req, res) => {
  if (!req.verComo) throw httpError(400, 'Esta não é uma sessão de ver como.');
  try { await cloudAuth.devCall(req.usuario.cloud_session_token, 'impersonate/end', {}); }
  catch (error) { if (error.status !== 401) throw error.statusCode ? error : falha(error, 'Não foi possível encerrar o ver como agora.'); }
  const token = String(req.usuario.cloud_session_token || '');
  if (token.startsWith('hash:')) markCloudSessionDead(token.slice(5), { hashed: true, userId: req.usuario.cloud_user_id });
  res.json({ ok: true });
}));

module.exports = router;
