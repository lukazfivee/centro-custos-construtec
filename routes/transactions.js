const crypto = require('crypto');
const express = require('express');
const { getDb, getInstanceIdentity } = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { buildTransactionFilters } = require('../lib/transactionFilters');
const { validDate } = require('../lib/dates');
const { csvLine, decimalBr } = require('../lib/csv');
const { recordAudit } = require('../services/audit');

const router = express.Router();
router.use(autenticar);

async function isMonthClosed(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const { rows } = await getDb().query('SELECT id FROM monthly_closings WHERE year=$1 AND month=$2', [year, month]);
  return !!rows[0];
}

const selectSql = `
  SELECT t.id,t.public_id,t.type AS tipo,t.cost_center_id,t.category_id,
    t.description AS descricao,t.counterparty AS favorecido,t.amount AS valor,
    t.transaction_date::text AS data,t.due_date::text AS vencimento,
    t.settlement_date::text AS data_liquidacao,t.financial_status AS status_financeiro,
    CASE WHEN t.financial_status='pendente' AND t.due_date<CURRENT_DATE THEN 'vencido'
      ELSE t.financial_status END AS situacao,
    t.document_number AS documento,t.payment_method AS forma_pagamento,
    t.notes AS observacao,t.revision,t.updated_at,
    t.origin_instance_name AS origem_nome,t.last_modified_instance_name AS alterado_em_instalacao,
    t.origin_user_name AS criado_por_nome,cc.code AS centro_codigo,cc.name AS centro_nome,
    c.name AS categoria
  FROM transactions t
  JOIN cost_centers cc ON cc.id=t.cost_center_id
  JOIN categories c ON c.id=t.category_id`;

router.get('/', asyncRoute(async (req, res) => {
  const { where, values } = buildTransactionFilters(req.query);
  const { rows } = await getDb().query(
    `${selectSql} ${where} ORDER BY t.transaction_date DESC,t.id DESC LIMIT 1000`, values
  );
  res.json(rows);
}));

router.get('/exportar.csv', asyncRoute(async (req,res) => {
  const { where,values }=buildTransactionFilters(req.query);
  const { rows }=await getDb().query(`${selectSql} ${where} ORDER BY t.transaction_date DESC,t.id DESC LIMIT 10000`,values);
  const lines=[csvLine(['Competência','Vencimento','Situação','Tipo','Centro','Obra / centro','Categoria','Descrição','Cliente / fornecedor','Documento','Forma de pagamento','Valor','Observação'])];
  rows.forEach((row)=>lines.push(csvLine([row.data,row.vencimento,row.situacao,row.tipo,row.centro_codigo,row.centro_nome,row.categoria,row.descricao,row.favorecido,row.documento,row.forma_pagamento,decimalBr(row.valor),row.observacao])));
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="relatorio-lancamentos.csv"');
  res.send(`\uFEFF${lines.join('\r\n')}`);
}));

router.post('/', asyncRoute(async (req, res) => {
  const data = validatePayload(req.body);
  if (await isMonthClosed(data.date)) throw httpError(403, 'Esta competência está fechada. Não é possível criar lançamentos nela.');
  await validateRelations(data, true);
  const instance = getInstanceIdentity();
  const { rows } = await getDb().query(
    `INSERT INTO transactions
      (public_id,type,cost_center_id,category_id,description,counterparty,amount,transaction_date,notes,
       due_date,settlement_date,financial_status,document_number,payment_method,
       origin_instance_id,origin_instance_name,last_modified_instance_id,last_modified_instance_name,
       origin_user_name,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$15,$16,$17,$18)
     RETURNING id,public_id`,
    [crypto.randomUUID(),data.type,data.costCenterId,data.categoryId,data.description,data.counterparty,
      data.amount,data.date,data.notes,data.dueDate,data.settlementDate,data.financialStatus,
      data.documentNumber,data.paymentMethod,instance.id,instance.name,req.usuario.name,req.usuario.id]
  );
  await recordAudit({entityType:'lancamento',entityId:rows[0].public_id,action:'criado',summary:`Lançamento criado: ${data.description}`,data,user:req.usuario});
  res.status(201).json(rows[0]);
}));

router.put('/:id', asyncRoute(async (req, res) => {
  const data = validatePayload(req.body);
  if (await isMonthClosed(data.date)) throw httpError(403, 'Esta competência está fechada. Não é possível editar lançamentos nela.');
  await validateRelations(data, false);
  const instance = getInstanceIdentity();
  const id=positiveId(req.params.id);
  const expectedRevision=Number(req.body.revisao);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw httpError(400, 'Revisão do lançamento inválida. Atualize a lista e tente novamente.');
  }
  const result = await getDb().query(
    `UPDATE transactions SET type=$1,cost_center_id=$2,category_id=$3,description=$4,counterparty=$5,
       amount=$6,transaction_date=$7,notes=$8,due_date=$9,settlement_date=$10,
       financial_status=$11,document_number=$12,payment_method=$13,last_modified_instance_id=$14,
       last_modified_instance_name=$15,revision=revision+1,updated_by=$16,updated_at=NOW()
     WHERE id=$17 AND revision=$18 AND deleted_at IS NULL
     RETURNING revision`,
    [data.type,data.costCenterId,data.categoryId,data.description,data.counterparty,data.amount,
      data.date,data.notes,data.dueDate,data.settlementDate,data.financialStatus,data.documentNumber,
      data.paymentMethod,instance.id,instance.name,req.usuario.id,id,expectedRevision]
  );
  if (!result.rowCount) {
    const existing=await getDb().query('SELECT id FROM transactions WHERE id=$1',[id]);
    if (!existing.rows.length) throw httpError(404, 'Lançamento não encontrado.');
    throw httpError(409, 'Este lançamento foi alterado ou excluído. Atualize a lista antes de editar novamente.');
  }
  await recordAudit({entityType:'lancamento',entityId:id,action:'atualizado',summary:`Lançamento atualizado: ${data.description}`,data,user:req.usuario});
  res.json({ ok: true, revisao:result.rows[0].revision });
}));

router.delete('/:id', exigirPapel('admin','gestor'), asyncRoute(async (req, res) => {
  const instance = getInstanceIdentity();
  const id=positiveId(req.params.id);
  const result = await getDb().query(
    `UPDATE transactions SET deleted_at=NOW(),updated_at=NOW(),revision=revision+1,
       last_modified_instance_id=$1,last_modified_instance_name=$2,updated_by=$3
     WHERE id=$4 AND deleted_at IS NULL`,
    [instance.id,instance.name,req.usuario.id,id]
  );
  if (!result.rowCount) throw httpError(404, 'Lançamento não encontrado.');
  await recordAudit({entityType:'lancamento',entityId:id,action:'excluido',summary:'Lançamento enviado para a lixeira.',user:req.usuario});
  res.json({ ok: true });
}));

function validatePayload(body) {
  const type = String(body.tipo || '');
  const description = String(body.descricao || '').trim();
  const counterparty = String(body.favorecido || '').trim() || null;
  const notes = String(body.observacao || '').trim() || null;
  const amount = Number(body.valor);
  const date = String(body.data || '');
  const requestedDueDate = String(body.vencimento || '').trim() || null;
  const requestedSettlement = String(body.data_liquidacao || '').trim() || null;
  const financialStatus = String(body.status_financeiro || 'liquidado');
  const documentNumber = String(body.documento || '').trim() || null;
  const paymentMethod = String(body.forma_pagamento || '').trim() || null;
  if (!['receita','despesa'].includes(type)) throw httpError(400, 'Informe se o lançamento é receita ou despesa.');
  if (!description) throw httpError(400, 'Informe a descrição.');
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'O valor precisa ser maior que zero.');
  if (!validDate(date)) throw httpError(400, 'Informe uma data válida.');
  if (requestedDueDate && !validDate(requestedDueDate)) throw httpError(400, 'Informe um vencimento válido.');
  if (requestedSettlement && !validDate(requestedSettlement)) throw httpError(400, 'Informe uma data de pagamento ou recebimento válida.');
  if (!['pendente','liquidado'].includes(financialStatus)) throw httpError(400, 'Situação financeira inválida.');
  const dueDate = requestedDueDate || date;
  const settlementDate = financialStatus === 'liquidado' ? (requestedSettlement || date) : null;
  return {
    type,costCenterId:positiveId(body.cost_center_id,'Centro de custo'),
    categoryId:positiveId(body.category_id,'Categoria'),description:description.slice(0,240),
    counterparty:counterparty?.slice(0,160),amount,date,notes,dueDate,
    settlementDate,financialStatus,documentNumber:documentNumber?.slice(0,80),
    paymentMethod:paymentMethod?.slice(0,40),
  };
}

async function validateRelations(data, requireActive) {
  const { rows } = await getDb().query(
    `SELECT cc.active AS center_active,c.active AS category_active,c.type AS category_type
     FROM cost_centers cc CROSS JOIN categories c WHERE cc.id=$1 AND c.id=$2`,
    [data.costCenterId,data.categoryId]
  );
  const relation = rows[0];
  if (!relation) throw httpError(400, 'Centro de custo ou categoria não encontrado.');
  if (requireActive && (!relation.center_active || !relation.category_active)) {
    throw httpError(400, 'Use um centro de custo e uma categoria ativos.');
  }
  if (relation.category_type !== 'ambos' && relation.category_type !== data.type) {
    throw httpError(400, 'A categoria não é compatível com o tipo do lançamento.');
  }
}

module.exports = router;

