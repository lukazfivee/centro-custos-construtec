const { getDb } = require('../../db');
const { httpError } = require('../../lib/http');
const cloudAuth = require('../cloudAuth');
const { suiteRoleOf } = require('../permissions');
const core = require('./core');

const localCorporate = (user) => getDb().mode === 'pglite' && user.cloud_managed;

function origin() {
  try {
    const url = new URL(cloudAuth.apiUrl());
    if (url.protocol === 'https:' && !url.username && !url.password) return url.origin;
  } catch { /* Configuração inválida não permite entregar o código a outro destino. */ }
  throw httpError(503, 'O endereço seguro da programação na nuvem não está configurado.');
}

async function open(user) {
  await core.actor(user);
  if (!localCorporate(user)) return { url: null };
  const base = origin();
  if (!user.cloud_session_token) throw httpError(428, 'Entre novamente com sua conta corporativa para abrir a programação.');
  let handoff;
  try { handoff = await cloudAuth.handoff(user.cloud_session_token, 'centro-custos'); }
  catch (error) {
    if (error.status === 401) throw httpError(428, 'Sua sessão corporativa expirou. Entre novamente.');
    if (error.status === 403) throw httpError(403, 'Sua conta não tem acesso ao Centro na nuvem.');
    throw httpError(503, 'Não foi possível abrir a programação na nuvem. Verifique a internet e tente novamente.');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(handoff?.code || ''))) throw httpError(503, 'A autenticação corporativa não retornou um código de acesso válido.');
  const path = suiteRoleOf(user) === 'tecnico' ? '/m/' : '/d/?programacao=1';
  return { url: `${base}${path}#handoff=${handoff.code}` };
}

function requireCanonical(user) {
  if (!localCorporate(user)) return;
  const error = httpError(409, 'Abra a programação na nuvem para compartilhar a agenda com a equipe.');
  error.extra = { codigo: 'PROGRAMACAO_NUVEM' };
  throw error;
}

module.exports = { open, requireCanonical };
