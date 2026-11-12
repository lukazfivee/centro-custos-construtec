const { httpError } = require('../../lib/http');
const { moneyCents } = require('../financialPolicy');
const atomic = (pool, fn) => pool.transaction ? pool.transaction(fn) : fn(pool);

async function lockExpense(tx, transactionId, costCenterId, amount = null) {
  await tx.query('SELECT id FROM financial_write_gate WHERE id=1 FOR UPDATE');
  const entry = (await tx.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE', [transactionId])).rows[0];
  if (!entry || entry.deleted_at || entry.type !== 'despesa' || entry.financial_status !== 'liquidado'
    || entry.approval_status !== 'aprovado') throw httpError(409, 'Aproprie somente despesas aprovadas e liquidadas, não excluídas.');
  if (entry.reversal_of) throw httpError(409, 'Classifique a despesa original. O estorno acompanha seu mapeamento.');
  const parts = (await tx.query('SELECT cost_center_id,amount FROM transaction_allocations WHERE transaction_id=$1', [transactionId])).rows;
  const expected = parts.length ? parts.find(p => Number(p.cost_center_id) === Number(costCenterId))?.amount
    : Number(entry.cost_center_id) === Number(costCenterId) ? entry.amount : null;
  if (expected == null) throw httpError(400, 'A obra não pertence ao lançamento ou ao seu rateio.');
  if (amount != null && moneyCents(amount) !== moneyCents(expected)) throw httpError(400, 'O valor deve corresponder à parcela financeira da obra.');
  return entry;
}

async function validateMapping(tx, params, costCenterId) {
  const { contractId, controlItemId, materialLineId, laborLineId } = params;
  const item = (await tx.query(`SELECT i.kind FROM budget_control_items i
    JOIN project_contracts pc ON pc.id=i.contract_id
    WHERE i.id=$1 AND pc.id=$2 AND pc.cost_center_id=$3 AND pc.status='active'`,
  [controlItemId,contractId,costCenterId])).rows[0];
  if (!item) throw httpError(400, 'O item e o contrato precisam pertencer à obra da apropriação.');
  if (materialLineId && laborLineId) throw httpError(400, 'Informe somente uma linha orçamentária.');
  for (const [id,table,kind] of [[materialLineId,'budget_material_lines','material'],[laborLineId,'budget_labor_lines','labor']]) {
    if (!id) continue;
    const line = await tx.query(`SELECT 1 FROM ${table} l JOIN budget_baselines b ON b.id=l.baseline_id
      WHERE l.id=$1 AND l.control_item_id=$2 AND b.contract_id=$3`, [id,controlItemId,contractId]);
    if (!line.rows.length || item.kind !== kind) throw httpError(400, 'Linha orçamentária incompatível com o item e contrato.');
  }
}

async function refresh(tx, transactionId) {
  await tx.query('SELECT reconcile_expense_allocations($1)', [transactionId]);
  const reversals = await tx.query(`SELECT r.id FROM transactions r JOIN transactions original
    ON original.public_id=r.reversal_of WHERE original.id=$1 AND r.deleted_at IS NULL`, [transactionId]);
  for (const r of reversals.rows) await tx.query('SELECT reconcile_expense_allocations($1)', [r.id]);
}

module.exports = { atomic, lockExpense, validateMapping, refresh };
