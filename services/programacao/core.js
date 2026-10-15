const { httpError } = require('../../lib/http');
const { suiteRoleOf, can } = require('../permissions');
const { recordAudit } = require('../audit');

async function manager(user) { return can(user, 'p5'); }
async function actor(user) {
  if (suiteRoleOf(user) !== 'tecnico' && !await manager(user)) throw httpError(403, 'Você não tem permissão para esta ação.');
}
async function load(db, id, user, lock = false) {
  const row = (await db.query(`SELECT a.*,a.day::text AS dia FROM daily_activities a WHERE a.id=$1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0];
  if (!row) throw httpError(404, 'Atividade não encontrada.');
  if (!await manager(user)) {
    await actor(user);
    const access = await db.query(`SELECT 1 FROM daily_participants p JOIN user_cost_centers uc
      ON uc.user_id=p.user_id AND uc.cost_center_id=$3
      WHERE p.activity_id=$1 AND p.user_id=$2 AND p.active${lock ? ' FOR SHARE OF p,uc' : ''}`, [id, user.id, row.cost_center_id]);
    if (!access.rows.length) throw httpError(404, 'Atividade não encontrada.');
  }
  return row;
}
async function project(db, activities, events = false) {
  if (!activities.length) return [];
  const ids = activities.map((a) => a.id);
  const centers = (await db.query('SELECT id,code,name,kind,client FROM cost_centers WHERE id=ANY($1::int[])', [activities.map((a) => a.cost_center_id)])).rows;
  const participants = (await db.query(`SELECT p.*,u.name FROM daily_participants p JOIN users u ON u.id=p.user_id
    WHERE p.activity_id=ANY($1::int[]) ORDER BY p.user_id`, [ids])).rows;
  const timeline = events ? (await db.query('SELECT * FROM daily_events WHERE activity_id=ANY($1::int[]) ORDER BY id', [ids])).rows : [];
  return activities.map((a) => {
    const cc = centers.find((c) => c.id === a.cost_center_id);
    const item = { id: a.id, dia: a.dia, ordem: a.sort_order, orientacao: a.instructions, revision: a.revision,
      cancelada: a.canceled, motivoCancelamento: a.cancel_reason, origemId: a.origin_id,
      centro: { id: cc.id, codigo: cc.code, nome: cc.name, tipo: cc.kind, cliente: cc.client || '' },
      participantes: participants.filter((p) => p.activity_id === a.id).map((p) => ({ id: p.user_id, nome: p.name, estado: p.state, revision: p.revision, ativo: p.active })) };
    if (events) item.eventos = timeline.filter((e) => e.activity_id === a.id).map((e) => ({ id: e.id, usuarioId: e.user_id,
      nome: e.user_name, estado: e.state, observacao: e.observation, criadoEm: e.created_at, tipo: e.type }));
    return item;
  });
}
async function detail(db, id, user) { return (await project(db, [await load(db, id, user)], true))[0]; }
async function list(db, dia, user) {
  await actor(user);
  const admin = await manager(user);
  const { rows } = await db.query(`SELECT a.*,a.day::text AS dia FROM daily_activities a WHERE a.day=$1
    ${admin ? '' : `AND EXISTS(SELECT 1 FROM daily_participants p JOIN user_cost_centers uc
      ON uc.user_id=p.user_id AND uc.cost_center_id=a.cost_center_id WHERE p.activity_id=a.id AND p.user_id=$2 AND p.active)`}
    ORDER BY a.sort_order,a.id`, admin ? [dia] : [dia, user.id]);
  return { dia, atividades: await project(db, rows) };
}
async function options(db, dia) {
  const users = (await db.query(`SELECT u.id,u.name,u.role,u.suite_role,EXISTS(SELECT 1 FROM daily_participants p JOIN daily_activities a
    ON a.id=p.activity_id WHERE p.user_id=u.id AND p.active AND NOT a.canceled AND a.day=$1) AS scheduled
    FROM users u WHERE u.active AND u.deleted_at IS NULL ORDER BY u.name,u.id`, [dia])).rows;
  const centers = (await db.query('SELECT id,code,name,kind,client FROM cost_centers WHERE active ORDER BY code,id')).rows;
  return { tecnicos: users.filter((u) => suiteRoleOf(u) === 'tecnico').map((u) => ({ id: u.id, nome: u.name, programado: u.scheduled })),
    centros: centers.map((c) => ({ id: c.id, codigo: c.code, nome: c.name, tipo: c.kind, cliente: c.client || '' })) };
}
async function event(db, activityId, user, type, observation, state = null, operation = null) {
  await db.query(`INSERT INTO daily_events(activity_id,user_id,user_name,type,observation,state,client_id,request_payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [activityId, user.id, user.name, type, observation, state,
    operation?.clientId || null, operation ? JSON.stringify(operation) : null]);
}
async function audit(db, id, user, action, data, before) {
  await recordAudit({ entityType: 'programacao', entityId: id, action, summary: `Programação diária: ${action}`, data, before, user, client: db });
}
function expected(row, revision) {
  if (row.revision !== revision) throw httpError(409, 'A atividade foi alterada. Atualize antes de salvar.');
}
function editable(row) { if (row.canceled) throw httpError(409, 'Esta atividade foi cancelada.'); }
module.exports = { actor, manager, load, detail, list, options, event, audit, expected, editable };
