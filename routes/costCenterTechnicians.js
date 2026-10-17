// Atribuição operacional feita no detalhe da obra ou do serviço, ambos independentes.
const express = require('express');
const { getDb } = require('../db');
const { autenticar } = require('../middleware/auth');
const { exigirPermissao, suiteRoleOf } = require('../services/permissions');
const { assertObra } = require('../services/obraScope');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { recordAudit } = require('../services/audit');

const router = express.Router();
const auth = [autenticar, exigirPermissao('p5')];
const sorted = (ids) => [...new Set(ids)].sort((a, b) => a - b);
function readIds(value) {
  if (!Array.isArray(value) || value.length > 500 || !value.every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw httpError(400, 'Informe uma lista válida de técnicos e a seleção anterior.');
  }
  return sorted(value);
}
async function center(db, id, lock = false) {
  const row = (await db.query(`SELECT id,public_id,code FROM cost_centers WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0];
  if (!row) throw httpError(404, 'Obra ou serviço não encontrado.');
  return row;
}
async function assigned(db, id) {
  // Somente vínculos do perfil técnico; vínculos de engenharia são preservados.
  const { rows } = await db.query(`SELECT u.id,u.role,u.suite_role FROM user_cost_centers uc
    JOIN users u ON u.id=uc.user_id WHERE uc.cost_center_id=$1`, [id]);
  return sorted(rows.filter((u) => suiteRoleOf(u) === 'tecnico').map((u) => Number(u.id)));
}

router.get('/:id/tecnicos', ...auth, asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id), db = getDb();
  await assertObra(req, id);
  await center(db, id);
  const { rows } = await db.query('SELECT id,name,role,suite_role FROM users WHERE active=TRUE AND deleted_at IS NULL ORDER BY name,id');
  const tecnicos = rows.filter((u) => suiteRoleOf(u) === 'tecnico').map((u) => ({ id: Number(u.id), nome: u.name }));
  res.json({ tecnicos, atribuidos: await assigned(db, id) });
}));

router.put('/:id/tecnicos', ...auth, asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id), ids = readIds(req.body?.tecnicos), previous = readIds(req.body?.anteriores);
  await assertObra(req, id);
  await getDb().transaction(async (tx) => {
    const item = await center(tx, id, true);
    const current = await assigned(tx, id);
    if (JSON.stringify(previous) !== JSON.stringify(current)) throw httpError(409, 'A equipe foi alterada por outra pessoa. Atualize a lista antes de salvar.');
    if (ids.length) {
      const { rows } = await tx.query('SELECT id,role,suite_role FROM users WHERE id=ANY($1::int[]) AND active=TRUE AND deleted_at IS NULL FOR SHARE', [ids]);
      if (rows.length !== ids.length || rows.some((u) => suiteRoleOf(u) !== 'tecnico')) throw httpError(400, 'Escolha somente contas ativas de técnico.');
    }
    if (current.length) await tx.query('DELETE FROM user_cost_centers WHERE cost_center_id=$1 AND user_id=ANY($2::int[])', [id, current]);
    if (ids.length) await tx.query(`INSERT INTO user_cost_centers (user_id,cost_center_id)
      SELECT unnest($1::int[]),$2 ON CONFLICT DO NOTHING`, [ids, id]);
    await recordAudit({ entityType: 'centro_custo', entityId: item.public_id, action: 'tecnicos_atribuidos',
      summary: `Técnicos designados: ${item.code}`, data: { tecnicos: ids }, before: { tecnicos: current }, user: req.usuario, client: tx });
  });
  res.json({ atribuidos: ids });
}));

module.exports = router;
