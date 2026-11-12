const crypto = require('crypto');
const { httpError } = require('../../lib/http');
const { atomic, lockExpense, validateMapping, refresh } = require('./allocationLifecycle');

/**
 * Cria ou atualiza alocação de despesa vinculada a um item de controle orçamentário
 */
async function recordExpenseAllocationInTransaction(pool, params) {
  const {
    transactionId,
    costCenterId,
    amount,
    contractId = null,
    controlItemId = null,
    materialLineId = null,
    laborLineId = null,
    quantity = null,
    unit = null,
    notes = null,
  } = params;

  if (!transactionId || !costCenterId || amount == null) {
    throw new Error('PARAMETROS_INVALIDOS: transactionId, costCenterId e amount são obrigatórios');
  }
  if (controlItemId && !contractId) throw httpError(400, 'Informe o contrato do item de controle.');
  await lockExpense(pool, transactionId, costCenterId, amount);
  if (contractId && !(await pool.query('SELECT 1 FROM project_contracts WHERE id=$1 AND cost_center_id=$2 AND status=\'active\'', [contractId,costCenterId])).rows.length) {
    throw httpError(400, 'O contrato não pertence à obra.');
  }
  const mapped = await pool.query(`SELECT id,control_item_id,contract_id FROM expense_allocations
    WHERE transaction_id=$1 AND cost_center_id=$2 AND active AND mapping_status='mapped'`, [transactionId,costCenterId]);
  if (mapped.rows.length) {
    const previous = mapped.rows[0];
    if (mapped.rows.length > 1 || (controlItemId && (previous.control_item_id !== controlItemId || previous.contract_id !== contractId))) {
      throw httpError(409, 'Use o identificador da apropriação para alterar seu mapeamento.');
    }
    return { id:previous.id, mappingStatus:'mapped' };
  }

  // Reuso idempotente: se já existe alocação unmapped da transação (ex.: criada automaticamente),
  // mapeia/reutiliza em vez de duplicar.
  const prev = await pool.query(
    `SELECT id FROM expense_allocations
     WHERE transaction_id = $1 AND cost_center_id=$2 AND active AND mapping_status = 'unmapped'
     ORDER BY created_at LIMIT 1`,
    [transactionId,costCenterId]
  );
  if (prev.rows[0]) {
    if (!controlItemId) return { id: prev.rows[0].id, mappingStatus: 'unmapped' };
    await mapExistingAllocationInTransaction(pool, {
      allocationId: prev.rows[0].id, contractId, controlItemId,
      materialLineId, laborLineId, quantity, unit, notes,
    });
    return { id: prev.rows[0].id, mappingStatus: 'mapped' };
  }

  const mappingStatus = controlItemId ? 'mapped' : 'unmapped';
  const id = crypto.randomUUID();

  // Validar se o item de controle pertence ao contrato se informado
  if (controlItemId && contractId) {
    await validateMapping(pool, params, costCenterId);
    const itemCheck = await pool.query(
      'SELECT id FROM budget_control_items WHERE id = $1 AND contract_id = $2',
      [controlItemId, contractId]
    );
    if (itemCheck.rows.length === 0) {
      throw new Error('ITEM_CONTROLE_INVALIDO: O item de controle não pertence ao contrato informado');
    }
  }

  await pool.query(`
    INSERT INTO expense_allocations
      (id, transaction_id, cost_center_id, contract_id, control_item_id, material_line_id, labor_line_id, amount, quantity, unit, mapping_status, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    id,
    transactionId,
    costCenterId,
    contractId,
    controlItemId,
    materialLineId,
    laborLineId,
    amount,
    quantity,
    unit,
    mappingStatus,
    notes,
  ]);

  // O mesmo reconciliador usado pelos lançamentos produz o reconhecimento.
  if (mappingStatus === 'mapped') {
    await refresh(pool, transactionId);
  }

  return { id, mappingStatus };
}

/**
 * Mapeia uma alocação preexistente para um item de controle de baseline
 */
async function mapExistingAllocationInTransaction(pool, params) {
  const {
    allocationId,
    contractId,
    controlItemId,
    materialLineId = null,
    laborLineId = null,
    quantity = null,
    unit = null,
    notes = null,
  } = params;

  if (!allocationId || !contractId || !controlItemId) {
    throw new Error('PARAMETROS_INVALIDOS: allocationId, contractId e controlItemId são obrigatórios');
  }

  const allocRes = await pool.query('SELECT * FROM expense_allocations WHERE id = $1', [allocationId]);
  if (allocRes.rows.length === 0) {
    throw new Error('ALOCACAO_NAO_ENCONTRADA: Alocação não encontrada');
  }
  const alloc = allocRes.rows[0];
  await lockExpense(pool, alloc.transaction_id, alloc.cost_center_id);
  if (!(await pool.query('SELECT 1 FROM expense_allocations WHERE id=$1 AND active', [allocationId])).rows.length) {
    throw httpError(409, 'A apropriação está inativa. Atualize a lista.');
  }
  await validateMapping(pool, params, alloc.cost_center_id);

  // Verificar item de controle
  const itemCheck = await pool.query(
    'SELECT id FROM budget_control_items WHERE id = $1 AND contract_id = $2',
    [controlItemId, contractId]
  );
  if (itemCheck.rows.length === 0) {
    throw new Error('ITEM_CONTROLE_INVALIDO: O item de controle não pertence ao contrato');
  }

  await pool.query(`
    UPDATE expense_allocations
    SET contract_id = $1,
        control_item_id = $2,
        material_line_id = $3,
        labor_line_id = $4,
        quantity = $5,
        unit = $6,
        mapping_status = 'mapped',
        notes = COALESCE($7, notes)
    WHERE id = $8
  `, [contractId, controlItemId, materialLineId, laborLineId, quantity, unit, notes, allocationId]);

  await refresh(pool, alloc.transaction_id);
  return { success: true, allocationId, controlItemId };
}

/**
 * Desfaz o mapeamento de uma alocação (retorna a unmapped)
 */
async function unmapAllocationInTransaction(pool, allocationId) {
  const alloc = (await pool.query('SELECT * FROM expense_allocations WHERE id=$1 AND active', [allocationId])).rows[0];
  if (!alloc) throw httpError(404, 'Apropriação não encontrada.');
  await lockExpense(pool, alloc.transaction_id, alloc.cost_center_id);
  await pool.query(`
    UPDATE expense_allocations
    SET control_item_id = NULL,
        material_line_id = NULL,
        labor_line_id = NULL,
        mapping_status = 'unmapped'
    WHERE id = $1
  `, [allocationId]);

  await pool.query("UPDATE cost_recognitions SET status='reversed' WHERE allocation_id=$1 AND status='approved'", [allocationId]);
  await refresh(pool, alloc.transaction_id);
  return { success: true, allocationId };
}

/**
 * Lista alocações de um centro de custo com metadados da transação
 */
async function listCostCenterAllocations(pool, costCenterId, filters = {}) {
  const { status } = filters;
  let sql = `
    SELECT
      ea.id,
      ea.transaction_id,
      ea.cost_center_id,
      ea.contract_id,
      ea.control_item_id,
      ea.amount,
      ea.quantity,
      ea.unit,
      ea.mapping_status,
      ea.notes,
      ea.created_at,
      t.transaction_date AS transaction_date,
      t.description AS transaction_description,
      t.payment_method,
      t.type AS transaction_type,
      bci.name AS control_item_name,
      bci.kind AS control_item_kind
    FROM expense_allocations ea
    JOIN transactions t ON t.id = ea.transaction_id
    LEFT JOIN budget_control_items bci ON bci.id = ea.control_item_id
    WHERE ea.cost_center_id = $1 AND ea.active AND t.deleted_at IS NULL
      AND t.type='despesa' AND t.financial_status='liquidado' AND t.approval_status='aprovado'
  `;
  const params = [costCenterId];

  if (status) {
    sql += ' AND ea.mapping_status = $2';
    params.push(status);
  }

  sql += ' ORDER BY t.transaction_date DESC, ea.created_at DESC';
  const result = await pool.query(sql, params);
  return result.rows;
}

const recordExpenseAllocation = (pool, params) => atomic(pool, tx => recordExpenseAllocationInTransaction(tx, params));
const mapExistingAllocation = (pool, params) => atomic(pool, tx => mapExistingAllocationInTransaction(tx, params));
const unmapAllocation = (pool, id) => atomic(pool, tx => unmapAllocationInTransaction(tx, id));

module.exports = {
  recordExpenseAllocation,
  mapExistingAllocation,
  unmapAllocation,
  listCostCenterAllocations,
};
