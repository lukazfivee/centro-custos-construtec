const { allocatedTransactionsSql } = require('../services/financialProjection');
const express = require('express');
const { LINKED_TABLES } = require('../services/costCenterLinks');
const crypto = require('crypto');
const { getDb } = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { obrasPermitidas, assertObra, bloquearEscopado } = require('../services/obraScope');
const { exigirPermissao, suiteRoleOf } = require('../services/permissions');
const { operationalCenters } = require('../services/costCenterOperational');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { parsePagination, wantsPagination, paginationMeta } = require('../lib/pagination');
const { csvLine, decimalBr } = require('../lib/csv');
const { validDate, currentMonth, validMonth, monthRange, todaySql } = require('../lib/dates');
const { recordAudit } = require('../services/audit');
const { getPortfolioSummary } = require('../services/budgets/budgetPortfolio');
const { getCostCenterCurveS } = require('../services/budgets/budgetCurveS');
const { getProposalOrigin } = require('../services/budgets/proposalOrigin');
const { ensurePeriods, skipInactivePeriods } = require('../services/maintenanceBalance');

const router = express.Router();
router.use(autenticar);

router.get('/portfolio-summary', bloquearEscopado, asyncRoute(async (req, res) => {
  res.json(await getPortfolioSummary(getDb(), { kind: kindFilter(req.query.kind) }));
}));

router.get('/:id/curva-s', asyncRoute(async (req, res) => {
  await assertObra(req, positiveId(req.params.id));
  res.json(await getCostCenterCurveS(getDb(), positiveId(req.params.id)));
}));

const COST_CENTERS_SELECT = `
  SELECT cc.id, cc.code AS codigo, cc.name AS nome, cc.responsible AS responsavel,
    cc.client AS cliente, cc.contract_number AS contrato,
    cc.start_date::text AS data_inicio, cc.end_date::text AS data_fim,
    cc.contract_amount AS valor_contrato, cc.project_status AS situacao,
    cc.monthly_budget AS orcamento, cc.active AS ativo, cc.description AS descricao,cc.revision,cc.kind AS tipo,
    COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa'
      AND t.transaction_date >= $1 AND t.transaction_date < $2),0) AS total_comprometido_mes,
    COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa'),0) AS total_comprometido,
    COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa' AND t.financial_status='liquidado'),0) AS total_despesas,
    COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='receita' AND t.financial_status='liquidado'),0) AS total_receitas
  FROM cost_centers cc LEFT JOIN ${allocatedTransactionsSql} t ON t.cost_center_id=cc.id AND t.deleted_at IS NULL`;

router.get('/', asyncRoute(async (req, res) => {
  if (suiteRoleOf(req.usuario) === 'tecnico') return operationalCenters(req, res, { kind: kindFilter(req.query.kind) });
  const { month, range } = reportMonth(req.query);
  const orderBy = 'cc.active DESC, cc.name';
  const ids = await obrasPermitidas(req);
  const kind = kindFilter(req.query.kind);
  // $1 e $2 sao o mes; depois vem o tipo (opcional) e a lista de obras do escopado.
  const base = [range.start, range.end];
  const where = (params) => {
    const parts = [];
    if (kind) { params.push(kind); parts.push(`cc.kind = $${params.length}`); }
    if (ids) { params.push(ids); parts.push(`cc.id = ANY($${params.length}::int[])`); }
    return parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  };

  if (!wantsPagination(req.query)) {
    const params = [...base];
    const { rows } = await getDb().query(
      `${COST_CENTERS_SELECT} ${where(params)} GROUP BY cc.id ORDER BY ${orderBy} LIMIT 500`, params);
    res.setHeader('X-Result-Limit', '500');
    return res.json(rows.map(row => ({...row,mes_orcamento:month})));
  }

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const params = [...base, limit, offset];
  const countParams = [];
  const countWhere = [];
  if (kind) { countParams.push(kind); countWhere.push(`kind = $${countParams.length}`); }
  if (ids) { countParams.push(ids); countWhere.push(`id = ANY($${countParams.length}::int[])`); }
  const [dataResult, countResult] = await Promise.all([
    getDb().query(`${COST_CENTERS_SELECT} ${where(params)} GROUP BY cc.id ORDER BY ${orderBy} LIMIT $3 OFFSET $4`, params),
    getDb().query(`SELECT COUNT(*)::int AS total FROM cost_centers ${countWhere.length ? 'WHERE ' + countWhere.join(' AND ') : ''}`, countParams),
  ]);
  const total = Number(countResult.rows[0]?.total || 0);
  res.setHeader('X-Total-Count', String(total));
  return res.json({
    itens: dataResult.rows.map(row => ({...row,mes_orcamento:month})),
    paginacao: paginationMeta(total, page, limit),
  });
}));

router.get('/:id/detalhes', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  if (suiteRoleOf(req.usuario) === 'tecnico') return operationalCenters(req, res, { id });
  await assertObra(req, id);
  const { month, range } = reportMonth(req.query);
  const db = getDb();
  const centerResult = await db.query(`
    SELECT cc.id, cc.code AS codigo, cc.name AS nome, cc.responsible AS responsavel,
      cc.client AS cliente, cc.contract_number AS contrato, cc.description AS descricao,
      cc.start_date::text AS data_inicio, cc.end_date::text AS data_fim,
      cc.contract_amount AS valor_contrato, cc.project_status AS situacao,
      cc.monthly_budget AS orcamento, cc.active AS ativo,cc.revision,cc.kind AS tipo,
      COALESCE((SELECT SUM(m.amount * CASE WHEN m.reversal_of IS NULL THEN 1 ELSE -1 END)
        FROM maintenance_movements m WHERE m.destination_id=cc.id AND m.movement_date<=${todaySql()}),0) AS verba_realocada_manutencao,
      COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa'
        AND t.transaction_date >= $2 AND t.transaction_date < $3),0) AS total_comprometido_mes,
      COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa'),0) AS total_comprometido,
      COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa' AND t.financial_status='liquidado'),0) AS total_despesas,
      COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='receita' AND t.financial_status='liquidado'),0) AS total_receitas,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS total_lancamentos
    FROM cost_centers cc LEFT JOIN ${allocatedTransactionsSql} t ON t.cost_center_id=cc.id
    WHERE cc.id=$1 GROUP BY cc.id
  `, [id, range.start, range.end]);
  if (!centerResult.rows[0]) throw httpError(404, 'Centro de custo não encontrado.');
  const center = centerResult.rows[0];
  center.mes_orcamento = month;
  center.proposta_origem = await getProposalOrigin(db, id);
  const { rows: transactions } = await db.query(`
    SELECT t.id, t.public_id, t.type AS tipo, t.description AS descricao, t.counterparty AS favorecido,
      t.amount AS valor,t.original_amount AS valor_original,t.accounting_sign AS sinal_contabil,t.reversal_of AS estorno_de,
      t.reversal_reason AS motivo_estorno,t.reversed_at,
      t.transaction_date::text AS data, t.due_date::text AS vencimento,
      t.financial_status AS status_financeiro, t.document_number AS documento,
      t.payment_method AS forma_pagamento, t.notes AS observacao,
      CASE WHEN t.financial_status='pendente' AND t.due_date<${todaySql()} THEN 'vencido'
        ELSE t.financial_status END AS situacao,
      c.name AS categoria
    FROM ${allocatedTransactionsSql} t JOIN categories c ON c.id=t.category_id
    WHERE t.cost_center_id=$1 AND t.deleted_at IS NULL
    ORDER BY t.transaction_date DESC,t.id DESC
  `, [id]);
  res.json({ centro: center, lancamentos: transactions });
}));

router.get('/exportar.csv', bloquearEscopado, asyncRoute(async (req, res) => {
  const { rows } = await getDb().query(`
    SELECT cc.code, cc.name, cc.client, cc.contract_number, cc.responsible,
      cc.start_date, cc.end_date, cc.contract_amount, cc.monthly_budget, cc.project_status, cc.active,
      COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa'),0) AS committed,
      COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='despesa' AND t.financial_status='liquidado'),0) AS expenses,
      COALESCE(SUM(t.amount * t.accounting_sign) FILTER (WHERE t.type='receita' AND t.financial_status='liquidado'),0) AS revenues,
      COUNT(t.id) AS transactions_count
    FROM cost_centers cc LEFT JOIN ${allocatedTransactionsSql} t ON t.cost_center_id=cc.id AND t.deleted_at IS NULL
    GROUP BY cc.id ORDER BY cc.active DESC, cc.name
  `);
  const lines = [csvLine(['Código','Obra / centro','Cliente','Contrato','Responsável','Início','Término','Valor contratado','Orçamento mensal','Receitas recebidas','Despesas pagas','Total comprometido','Lançamentos','Situação','Status'])];
  rows.forEach((row) => lines.push(csvLine([
    row.code, row.name, row.client, row.contract_number, row.responsible, row.start_date, row.end_date,
    decimalBr(row.contract_amount), decimalBr(row.monthly_budget), decimalBr(row.revenues),
    decimalBr(row.expenses), decimalBr(row.committed), row.transactions_count, row.project_status,
    row.active ? 'Ativo' : 'Inativo',
  ])));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="centros-de-custo.csv"');
  res.send(`\uFEFF${lines.join('\r\n')}`);
}));

router.post('/', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  const data = validate(req.body);
  const publicId = crypto.randomUUID();
  const created = await getDb().transaction(async (db) => {
    if (data.kind === 'contrato_manutencao') await db.query('UPDATE financial_write_gate SET revision=revision+1 WHERE id=1');
    const { rows } = await db.query(`INSERT INTO cost_centers
      (public_id,code,name,responsible,monthly_budget,client,contract_number,start_date,end_date,contract_amount,project_status,description,kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,revision`,
    [publicId,data.code,data.name,data.responsible,data.budget,data.client,data.contractNumber,
      data.startDate,data.endDate,data.contractAmount,data.projectStatus,data.description,data.kind || 'obra']
    );
    if (data.kind === 'contrato_manutencao') {
      const count = await ensurePeriods(db, { id:rows[0].id, active:true, start_date:data.startDate, end_date:data.endDate, monthly_budget:data.budget });
      if (count) await recordAudit({entityType:'contrato_manutencao',entityId:rows[0].id,action:'competencias_criadas',summary:`Competências criadas no cadastro`,data:{ quantidade:count,valor_mensal:data.budget },user:req.usuario,client:db});
    }
    const label = data.kind === 'servico' ? 'Serviço criado: ' : data.kind === 'contrato_manutencao' ? 'Contrato de manutenção criado: ' : 'Obra / centro criado: ';
    await recordAudit({entityType:'obra',entityId:rows[0].id,action:'criada',summary:label+data.name,data,user:req.usuario,client:db});
    return rows[0];
  });
  res.status(201).json(created);
}));

router.put('/:id', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  const data = validate(req.body);
  const id = positiveId(req.params.id);
  // Quem envia a revisao (desktop novo) nao sobrescreve a alteracao de outra pessoa.
  const expected = req.body.revisao == null || req.body.revisao === '' ? null : Number(req.body.revisao);
  if (expected !== null && (!Number.isInteger(expected) || expected < 1)) throw httpError(400, 'Revisão da obra inválida.');
  const result = await getDb().transaction(async (db) => {
  await db.query('UPDATE financial_write_gate SET revision=revision+1 WHERE id=1');
  const original = (await db.query(`SELECT id,kind,active,monthly_budget,start_date::text,end_date::text,
    (created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS created_date FROM cost_centers WHERE id=$1 FOR UPDATE`, [id])).rows[0];
  if (original?.kind === 'contrato_manutencao') {
    if ((original.start_date || null) !== data.startDate && (await db.query('SELECT 1 FROM maintenance_periods WHERE cost_center_id=$1 LIMIT 1', [id])).rows.length) throw httpError(409, 'A data inicial não pode mudar após o registro de competências.');
    if (!original.active && req.body.ativo !== false) await skipInactivePeriods(db, original);
    const count = await ensurePeriods(db, original);
    if (count) await recordAudit({entityType:'contrato_manutencao',entityId:id,action:'competencias_criadas',summary:'Competências geradas antes da atualização',data:{quantidade:count},user:req.usuario,client:db});
    if (data.endDate && (await db.query('SELECT 1 FROM maintenance_periods WHERE cost_center_id=$1 AND period>date_trunc(\'month\',$2::date) LIMIT 1', [id,data.endDate])).rows.length) throw httpError(409, 'O término não pode excluir competências já registradas.');
  }
  const updated = await db.query(
    `UPDATE cost_centers SET code=$1,name=$2,responsible=$3,monthly_budget=$4,active=$5,
       client=$6,contract_number=$7,start_date=$8,end_date=$9,contract_amount=$10,
       project_status=$11,description=$12,kind=COALESCE($15::text,kind),revision=revision+1,updated_at=NOW()
     WHERE id=$13 AND ($14::integer IS NULL OR revision=$14)
       AND ($15::text IS NULL OR $15::text=kind OR NOT EXISTS
         (SELECT 1 FROM maintenance_periods WHERE cost_center_id=$13)) RETURNING revision`,
    [data.code,data.name,data.responsible,data.budget,req.body.ativo !== false,data.client,
      data.contractNumber,data.startDate,data.endDate,data.contractAmount,data.projectStatus,
      data.description,id,expected,data.kind]
  );
  if (!updated.rowCount) {
    const exists = await db.query('SELECT kind,EXISTS(SELECT 1 FROM maintenance_periods WHERE cost_center_id=$1) AS has_periods FROM cost_centers WHERE id=$1', [id]);
    if (exists.rows[0]?.has_periods && data.kind && exists.rows[0].kind !== data.kind) throw httpError(409, 'O tipo não pode mudar: o contrato já tem competências registradas.');
    if (exists.rows.length) throw httpError(409, 'Esta obra foi alterada por outra pessoa. Feche e abra de novo para ver a versão atual.');
    throw httpError(404, 'Centro de custo não encontrado.');
  }
  await recordAudit({entityType:'obra',entityId:req.params.id,action:'atualizada',summary:'Obra / centro atualizado: '+data.name,data:{...data,revision:updated.rows[0].revision},user:req.usuario,client:db});
  return updated;
  });
  res.json({ ok: true,revisao:result.rows[0].revision });
}));

router.delete('/:id', exigirPapel('admin', 'gestor'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  await assertObra(req, id);
  const vinculados = LINKED_TABLES;
  try {
    await getDb().transaction(async (db) => {
      // O lock impede que outro pedido vincule dados enquanto verificamos a exclusão.
      const check = await db.query('SELECT id, public_id, name FROM cost_centers WHERE id = $1 FOR UPDATE', [id]);
      if (!check.rows[0]) throw httpError(404, 'Centro de custo não encontrado.');
      for (const [table, label] of vinculados) {
        const found = await db.query(`SELECT 1 FROM ${table} WHERE cost_center_id = $1 LIMIT 1`, [id]);
        if (found.rows.length) throw httpError(409, `Centro de custo possui ${label} vinculados. Inative o centro para preservar os dados.`);
      }
      await db.query('INSERT INTO cost_center_tombstones (public_id) VALUES ($1) ON CONFLICT (public_id) DO NOTHING', [check.rows[0].public_id]);
      await db.query('DELETE FROM cost_centers WHERE id = $1', [id]);
      await recordAudit({entityType:'obra',entityId:id,action:'excluida',summary:'Obra / centro excluído: '+check.rows[0].name,data:null,user:req.usuario,client:db});
    });
  } catch (error) {
    if (error.code === '23503') throw httpError(409, 'Centro de custo possui dados vinculados. Inative o centro para preservá-los.');
    throw error;
  }
  res.json({ ok: true });
}));

function reportMonth(query) {
  const month = query.mes || currentMonth();
  if (!validMonth(month)) throw httpError(400, 'Mês inválido. Use AAAA-MM.');
  return {month,range:monthRange(month)};
}

// Vazio devolve null: quem chama decide o padrao.
function parseKind(value) {
  if (value == null || value === '') return null;
  const kind = String(value).trim().toLowerCase();
  if (!['obra', 'servico', 'contrato_manutencao'].includes(kind)) throw httpError(400, 'Tipo inválido. Use obra, servico ou contrato_manutencao.');
  return kind;
}

function kindFilter(value) {
  if (value == null || value === '' || value === 'todos') return null;
  return parseKind(value);
}

function validate(body) {
  const kind = parseKind(body.tipo ?? body.kind);
  const code = String(body.codigo || '').trim();
  const name = String(body.nome || '').trim();
  const responsible = String(body.responsavel || '').trim() || null;
  const budget = Number(body.orcamento || 0);
  const client = String(body.cliente || '').trim() || null;
  const contractNumber = String(body.contrato || '').trim() || null;
  const startDate = String(body.data_inicio || '').trim() || null;
  const endDate = String(body.data_fim || '').trim() || null;
  const contractAmount = Number(body.valor_contrato || 0);
  const projectStatus = String(body.situacao || 'planejamento');
  const description = String(body.descricao || '').trim() || null;
  if (!code || !name) throw httpError(400, 'Informe código e nome.');
  if (!Number.isFinite(budget) || budget < 0) throw httpError(400, 'Orçamento inválido.');
  if (!Number.isFinite(contractAmount) || contractAmount < 0) throw httpError(400, 'Valor contratado inválido.');
  if (startDate && !validDate(startDate)) throw httpError(400, 'Data inicial inválida.');
  if (endDate && !validDate(endDate)) throw httpError(400, 'Data final inválida.');
  if (startDate && endDate && endDate < startDate) throw httpError(400, 'A data final não pode ser anterior à inicial.');
  if (!['planejamento','execucao','pausado','concluido'].includes(projectStatus)) throw httpError(400, 'Situação da obra inválida.');
  return { code:code.slice(0,40),name:name.slice(0,140),responsible:responsible?.slice(0,120),budget,
    client:client?.slice(0,160),contractNumber:contractNumber?.slice(0,80),startDate,endDate,
    contractAmount,projectStatus,description,kind };
}

module.exports = router;
