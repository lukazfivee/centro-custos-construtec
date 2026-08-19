const express = require('express');
const { getDb } = require('../db');
const { autenticar } = require('../middleware/auth');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { currentMonth, validMonth, monthRange, monthsEndingAt } = require('../lib/dates');

const router = express.Router();
router.use(autenticar);

router.get('/resumo', asyncRoute(async (req, res) => {
  const month = req.query.mes || currentMonth();
  if (!validMonth(month)) throw httpError(400, 'Mês inválido. Use AAAA-MM.');
  const centerId = req.query.centroId ? positiveId(req.query.centroId,'Centro de custo') : null;
  const range = monthRange(month);
  const params = [range.start,range.end,centerId];
  const db = getDb();
  const summary = await db.query(`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type='receita' AND financial_status='liquidado'
        AND transaction_date >= $1 AND transaction_date < $2),0) AS receitas,
      COALESCE(SUM(amount) FILTER (WHERE type='despesa' AND financial_status='liquidado'
        AND transaction_date >= $1 AND transaction_date < $2),0) AS despesas,
      COALESCE(SUM(amount) FILTER (WHERE type='receita' AND financial_status='pendente'
        AND COALESCE(due_date,transaction_date) >= $1 AND COALESCE(due_date,transaction_date) < $2),0) AS a_receber,
      COALESCE(SUM(amount) FILTER (WHERE type='despesa' AND financial_status='pendente'
        AND COALESCE(due_date,transaction_date) >= $1 AND COALESCE(due_date,transaction_date) < $2),0) AS a_pagar,
      COUNT(*) FILTER (WHERE transaction_date >= $1 AND transaction_date < $2) AS qtd_lancamentos
    FROM transactions WHERE deleted_at IS NULL AND ($3::integer IS NULL OR cost_center_id=$3)
  `, params);
  const overdue = await db.query(`
    SELECT COALESCE(SUM(amount),0) AS total,COUNT(*) AS quantidade
    FROM transactions WHERE deleted_at IS NULL AND financial_status='pendente'
      AND due_date<CURRENT_DATE AND ($1::integer IS NULL OR cost_center_id=$1)
  `, [centerId]);
  const centers = await db.query(`
    SELECT cc.id,cc.code AS codigo,cc.name AS nome,cc.client AS cliente,
      cc.monthly_budget AS orcamento,cc.project_status AS situacao,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type='receita' AND t.financial_status='liquidado'),0) AS receitas,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type='despesa' AND t.financial_status='liquidado'),0) AS despesas,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type='despesa'),0) AS comprometido,
      COUNT(t.id) AS qtd_lancamentos
    FROM cost_centers cc LEFT JOIN transactions t ON t.cost_center_id=cc.id AND t.deleted_at IS NULL
      AND t.transaction_date >= $1 AND t.transaction_date < $2
    WHERE cc.active=TRUE AND ($3::integer IS NULL OR cc.id=$3)
    GROUP BY cc.id ORDER BY despesas DESC,cc.name
  `, params);
  const categories = await db.query(`
    SELECT c.id,c.name AS categoria,t.type AS tipo,SUM(t.amount) AS total,COUNT(*) AS quantidade
    FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE t.deleted_at IS NULL AND t.transaction_date >= $1 AND t.transaction_date < $2
      AND ($3::integer IS NULL OR t.cost_center_id=$3)
    GROUP BY c.id,t.type ORDER BY t.type,total DESC
  `, params);
  const recent = await db.query(`
    SELECT t.id,t.type AS tipo,t.transaction_date::text AS data,t.description AS descricao,
      t.due_date::text AS vencimento,t.financial_status AS status_financeiro,
      CASE WHEN t.financial_status='pendente' AND t.due_date<CURRENT_DATE THEN 'vencido'
        ELSE t.financial_status END AS situacao,
      t.amount AS valor,cc.name AS centro_nome,c.name AS categoria
    FROM transactions t JOIN cost_centers cc ON cc.id=t.cost_center_id
    JOIN categories c ON c.id=t.category_id
    WHERE t.deleted_at IS NULL AND t.transaction_date >= $1 AND t.transaction_date < $2
      AND ($3::integer IS NULL OR t.cost_center_id=$3)
    ORDER BY t.created_at DESC LIMIT 8
  `, params);
  const months = monthsEndingAt(month);
  const trend = await db.query(`
    SELECT TO_CHAR(DATE_TRUNC('month',transaction_date),'YYYY-MM') AS mes,
      COALESCE(SUM(amount) FILTER (WHERE type='receita'),0) AS receitas,
      COALESCE(SUM(amount) FILTER (WHERE type='despesa'),0) AS despesas
    FROM transactions WHERE deleted_at IS NULL AND financial_status='liquidado'
      AND transaction_date >= $1 AND transaction_date < $2
      AND ($3::integer IS NULL OR cost_center_id=$3)
    GROUP BY DATE_TRUNC('month',transaction_date) ORDER BY mes
  `, [`${months[0]}-01`,range.end,centerId]);
  const trendMap = new Map(trend.rows.map((row) => [row.mes,row]));
  const totals = summary.rows[0];
  const budget = centers.rows.reduce((sum,item) => sum + Number(item.orcamento),0);
  const committed = centers.rows.reduce((sum,item) => sum + Number(item.comprometido),0);
  res.json({
    mes:month,receitas:Number(totals.receitas),despesas:Number(totals.despesas),
    saldo:Number(totals.receitas)-Number(totals.despesas),orcamento:budget,
    aReceber:Number(totals.a_receber),aPagar:Number(totals.a_pagar),
    vencidos:Number(overdue.rows[0].total),qtdVencidos:Number(overdue.rows[0].quantidade),
    comprometido:committed,saldoOrcamento:budget-committed,
    qtdLancamentos:Number(totals.qtd_lancamentos),porCentro:centers.rows,
    porCategoria:categories.rows,ultimosLancamentos:recent.rows,
    tendencia:months.map((item) => trendMap.get(item) || { mes:item,receitas:0,despesas:0 }),
  });
}));

module.exports = router;

