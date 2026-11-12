const { httpError } = require('../../lib/http');
const { todayIso } = require('../../lib/dates');
const { suiteRoleOf } = require('../permissions');
const v = require('./validation');
const core = require('./core');

async function update(db, id, body, user) {
  if (suiteRoleOf(user) !== 'tecnico') throw httpError(403, 'Somente o próprio técnico altera seu andamento.');
  const operation = v.progress(body);
  return db.transaction(async (tx) => {
    const row = await core.load(tx, id, user, true);
    const previous = (await tx.query('SELECT activity_id,request_payload FROM daily_events WHERE user_id=$1 AND client_id=$2', [user.id, operation.clientId])).rows[0];
    if (previous) {
      const payload = previous.request_payload;
      if (previous.activity_id !== id || Object.keys(operation).some((key) => operation[key] !== payload[key])) {
        throw httpError(409, 'Este identificador já foi usado para outra atualização.');
      }
      return core.detail(tx, id, user);
    }
    core.editable(row);
    if (row.dia > todayIso('America/Sao_Paulo')) throw httpError(400, 'O andamento só pode ser atualizado na data programada ou depois.');
    const participant = (await tx.query('SELECT revision FROM daily_participants WHERE activity_id=$1 AND user_id=$2 AND active FOR UPDATE', [id, user.id])).rows[0];
    if (!participant || participant.revision !== operation.revision) throw httpError(409, 'Seu andamento mudou. Atualize antes de enviar novamente.');
    await tx.query('UPDATE daily_participants SET state=$3,revision=revision+1 WHERE activity_id=$1 AND user_id=$2', [id, user.id, operation.estado]);
    await core.event(tx, id, user, 'andamento', operation.observacao, operation.estado, operation);
    await core.audit(tx, id, user, 'andamento', { estado: operation.estado, observacao: operation.observacao });
    return core.detail(tx, id, user);
  }).catch((error) => {
    // Outra atividade pode confirmar o mesmo UUID entre a consulta e a inserção.
    if (error.code === '23505' && error.constraint === 'daily_events_user_id_client_id_key') {
      throw httpError(409, 'Este identificador já foi usado para outra atualização.');
    }
    throw error;
  });
}
module.exports = { update };
