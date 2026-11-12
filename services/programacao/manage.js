const { httpError } = require('../../lib/http');
const { suiteRoleOf } = require('../permissions');
const v = require('./validation');
const core = require('./core');

async function center(db, id) {
  const row = (await db.query('SELECT id FROM cost_centers WHERE id=$1 AND active FOR SHARE', [id])).rows[0];
  if (!row) throw httpError(400, 'Escolha uma obra ou serviço ativo.');
}
async function team(db, id, centerId, selected) {
  const current = (await db.query('SELECT * FROM daily_participants WHERE activity_id=$1 ORDER BY user_id', [id])).rows;
  const newcomers = selected.filter((uid) => !current.some((p) => p.user_id === uid && p.active));
  if (newcomers.length) {
    const users = (await db.query(`SELECT id,role,suite_role FROM users WHERE id=ANY($1::int[]) AND active AND deleted_at IS NULL FOR SHARE`, [newcomers])).rows;
    if (users.length !== newcomers.length || users.some((u) => suiteRoleOf(u) !== 'tecnico')) throw httpError(400, 'Escolha somente contas ativas de técnico.');
  }
  await db.query('UPDATE daily_participants SET active=FALSE WHERE activity_id=$1 AND NOT(user_id=ANY($2::int[]))', [id, selected]);
  await db.query(`INSERT INTO daily_participants(activity_id,user_id)
    SELECT $1,unnest($2::int[]) ON CONFLICT(activity_id,user_id) DO UPDATE SET active=TRUE`, [id, selected]);
  if (newcomers.length) await db.query(`INSERT INTO user_cost_centers(user_id,cost_center_id)
    SELECT unnest($1::int[]),$2 ON CONFLICT DO NOTHING`, [newcomers, centerId]);
  return current.filter((p) => p.active).map((p) => p.user_id);
}
async function create(db, body, user) {
  const f = v.fields(body), centroId = v.positiveId(body.centroId);
  const origemId = body.origemId == null ? null : v.positiveId(body.origemId);
  return db.transaction(async (tx) => {
    await center(tx, centroId);
    if (origemId) {
      const origin = await core.load(tx, origemId, user);
      if (origin.cost_center_id !== centroId || origin.dia === f.dia) throw httpError(400, 'Copie para outra data mantendo o mesmo destino.');
    }
    const row = (await tx.query(`INSERT INTO daily_activities(day,cost_center_id,instructions,sort_order,origin_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [f.dia, centroId, f.orientacao, f.ordem, origemId, user.id])).rows[0];
    await team(tx, row.id, centroId, f.tecnicos);
    await core.event(tx, row.id, user, 'instrucao', f.orientacao);
    await core.event(tx, row.id, user, 'equipe', `Técnicos selecionados: ${f.tecnicos.join(', ')}.`);
    await core.audit(tx, row.id, user, 'criada', { ...f, centroId, origemId });
    return core.detail(tx, row.id, user);
  });
}
async function edit(db, id, body, user) {
  const f = v.fields(body), revision = v.revision(body.revision);
  return db.transaction(async (tx) => {
    const row = await core.load(tx, id, user, true);
    core.editable(row);
    core.expected(row, revision);
    if (body.centroId != null && Number(body.centroId) !== row.cost_center_id) throw httpError(400, 'O destino da atividade não pode ser alterado.');
    if (f.dia !== row.dia) {
      const progress = await tx.query("SELECT 1 FROM daily_events WHERE activity_id=$1 AND type='andamento' LIMIT 1", [id]);
      if (progress.rows.length) throw httpError(400, 'Esta atividade tem atualizações. Copie para outra data.');
    }
    const previous = await team(tx, id, row.cost_center_id, f.tecnicos);
    if (row.instructions !== f.orientacao) await core.event(tx, id, user, 'instrucao', `Orientação anterior: ${row.instructions}\nNova orientação: ${f.orientacao}`);
    if (JSON.stringify(previous) !== JSON.stringify(f.tecnicos)) await core.event(tx, id, user, 'equipe',
      `Equipe anterior: ${previous.join(', ')}. Equipe atual: ${f.tecnicos.join(', ')}.`);
    await tx.query(`UPDATE daily_activities SET day=$2,instructions=$3,sort_order=$4,revision=revision+1,updated_at=NOW() WHERE id=$1`,
      [id, f.dia, f.orientacao, f.ordem]);
    await core.audit(tx, id, user, 'alterada', f, { dia: row.dia, orientacao: row.instructions, tecnicos: previous, ordem: row.sort_order });
    return core.detail(tx, id, user);
  });
}
async function cancel(db, id, body, user) {
  const revision = v.revision(body.revision), motivo = v.text(body.motivo, 5000, true);
  return db.transaction(async (tx) => {
    const row = await core.load(tx, id, user, true);
    core.editable(row);
    core.expected(row, revision);
    await tx.query('UPDATE daily_activities SET canceled=TRUE,cancel_reason=$2,revision=revision+1,updated_at=NOW() WHERE id=$1', [id, motivo]);
    await core.event(tx, id, user, 'cancelamento', motivo);
    await core.audit(tx, id, user, 'cancelada', { motivo });
    return core.detail(tx, id, user);
  });
}
module.exports = { create, edit, cancel };
