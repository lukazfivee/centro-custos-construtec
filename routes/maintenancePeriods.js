const express = require('express');
const { getDb } = require('../db');
const { autenticar } = require('../middleware/auth');
const { exigirPermissao } = require('../services/permissions');
const { assertObra } = require('../services/obraScope');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { validMonth, currentMonth } = require('../lib/dates');
const { recordAudit } = require('../services/audit');
const { allocatedTransactionsSql } = require('../services/financialProjection');
const { isMonthClosed } = require('../services/financialPolicy');

const router = express.Router();
router.use(autenticar);

function monthOf(value) {
  const month = String(value || currentMonth());
  if (!validMonth(month) || month.startsWith('0000-')) throw httpError(400, 'Competência inválida. Use AAAA-MM.');
  return month;
}

async function center(db, id, lock = false) {
  const result = await db.query(`SELECT id,code,name,kind,active,monthly_budget,
    start_date::text AS start_date,end_date::text AS end_date,
    (created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS created_date FROM cost_centers WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
  const row = result.rows[0];
  if (!row || row.kind !== 'contrato_manutencao') throw httpError(404, 'Contrato de manutenção não encontrado.');
  return row;
}

router.get('/:id/competencias-manutencao', exigirPermissao('p1'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  await assertObra(req, id);
  const db = getDb();
  await center(db, id);
  const { rows } = await db.query(`SELECT p.id,to_char(p.period,'YYYY-MM') AS mes,p.monthly_amount AS valor_mensal,
    p.paid AS recebido,p.created_at,p.updated_at,
    COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa'),0) AS despesas_comprometidas,
    COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa' AND t.financial_status='liquidado'),0) AS despesas_pagas
    FROM maintenance_periods p LEFT JOIN ${allocatedTransactionsSql} t
      ON t.cost_center_id=p.cost_center_id AND t.transaction_date>=p.period
      AND t.transaction_date<(p.period + INTERVAL '1 month')
    WHERE p.cost_center_id=$1 GROUP BY p.id ORDER BY p.period DESC`, [id]);
  res.json(rows);
}));

router.post('/:id/competencias-manutencao', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const month = monthOf(req.body?.mes);
  if (month > currentMonth()) throw httpError(400, 'A competência ainda não começou.');
  await assertObra(req, id);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    await tx.query('UPDATE financial_write_gate SET revision=revision+1 WHERE id=1');
    const c = await center(tx, id, true);
    if (!c.active) throw httpError(409, 'O contrato está inativo.');
    if (month < (c.start_date || c.created_date).slice(0, 7) || (c.end_date && month > c.end_date.slice(0, 7))) {
      throw httpError(400, 'Competência fora da vigência do contrato.');
    }
    const existing = await tx.query("SELECT id,to_char(period,'YYYY-MM') AS mes,monthly_amount AS valor_mensal,paid AS recebido FROM maintenance_periods WHERE cost_center_id=$1 AND period=$2", [id, `${month}-01`]);
    if (existing.rows[0]) return { created: false, row: existing.rows[0] };
    if (await isMonthClosed(`${month}-01`,tx)) throw httpError(403, 'Esta competência está fechada.');
    const inserted = await tx.query(`INSERT INTO maintenance_periods(cost_center_id,period,monthly_amount)
      VALUES($1,$2,$3) RETURNING id,to_char(period,'YYYY-MM') AS mes,monthly_amount AS valor_mensal,paid AS recebido`, [id, `${month}-01`, c.monthly_budget]);
    await recordAudit({ entityType: 'contrato_manutencao', entityId: id, action: 'competencia_criada',
      summary: `Competência ${month} criada para ${c.code}`, data: inserted.rows[0], user: req.usuario, client: tx });
    return { created: true, row: inserted.rows[0] };
  });
  res.status(result.created ? 201 : 200).json(result.row);
}));

router.put('/:id/competencias-manutencao/:mes/recebimento', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const month = monthOf(req.params.mes);
  if (typeof req.body?.recebido !== 'boolean') throw httpError(400, 'Informe se o cliente pagou.');
  await assertObra(req, id);
  const db = getDb();
  await db.transaction(async (tx) => {
    const c = await center(tx, id, true);
    const found = await tx.query('SELECT id,paid FROM maintenance_periods WHERE cost_center_id=$1 AND period=$2 FOR UPDATE', [id, `${month}-01`]);
    if (!found.rows[0]) throw httpError(404, 'Competência não encontrada.');
    if (found.rows[0].paid === req.body.recebido) return;
    await tx.query('UPDATE maintenance_periods SET paid=$1,revision=revision+1,updated_at=NOW() WHERE id=$2', [req.body.recebido, found.rows[0].id]);
    await recordAudit({ entityType: 'contrato_manutencao', entityId: id, action: 'recebimento_atualizado',
      summary: `Recebimento de ${month} atualizado para ${c.code}`, data: { mes: month, recebido: req.body.recebido },
      before: { recebido: found.rows[0].paid }, user: req.usuario, client: tx });
  });
  res.json({ ok: true });
}));

module.exports = router;
