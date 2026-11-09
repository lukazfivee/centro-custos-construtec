const { allocatedTransactionsSql } = require('./financialProjection');
const { currentMonth, monthRange } = require('../lib/dates');
const { ocorrencia } = require('./recurringSchedule');
const { httpError } = require('../lib/http');

// Valores de transferências para o financeiro deixam de reduzir o saldo quando o
// lançamento correspondente é excluído ou estornado; o histórico é preservado.
const effective = `(m.financial_transaction_id IS NULL OR (t.deleted_at IS NULL AND NOT EXISTS
  (SELECT 1 FROM transactions r WHERE r.reversal_of=t.public_id AND r.deleted_at IS NULL AND r.transaction_date<$2)))`;

async function assertOpenPeriods(db,id,first,last) {
  const { rows } = await db.query(`SELECT to_char(d,'YYYY-MM') AS mes FROM generate_series($2::date,$3::date,interval '1 month') d
    WHERE financial_month_closed(d::date) AND NOT EXISTS
      (SELECT 1 FROM maintenance_periods WHERE cost_center_id=$1 AND period=d::date) LIMIT 1`, [id,`${first}-01`,`${last}-01`]);
  if (rows[0]) throw httpError(403, `A competência ${rows[0].mes} está fechada. Reabra-a antes de registrar o contrato.`);
}

async function balance(db, id, month = currentMonth()) {
  const end = monthRange(month).end;
  const { rows } = await db.query(`SELECT
    COALESCE((SELECT SUM(monthly_amount) FROM maintenance_periods WHERE cost_center_id=$1 AND period<$2),0) AS mensalidades,
    COALESCE((SELECT SUM(x.amount*x.accounting_sign) FROM ${allocatedTransactionsSql} x
      WHERE x.cost_center_id=$1 AND x.type='despesa' AND x.transaction_date<$2),0) AS despesas,
    COALESCE((SELECT SUM(m.amount*CASE WHEN m.reversal_of IS NULL THEN 1 ELSE -1 END)
      FROM maintenance_movements m LEFT JOIN transactions t ON t.id=m.financial_transaction_id
      WHERE m.destination_id=$1 AND m.movement_date<$2 AND ${effective}),0) AS entradas,
    COALESCE((SELECT SUM(m.amount*CASE WHEN m.reversal_of IS NULL THEN 1 ELSE -1 END)
      FROM maintenance_movements m LEFT JOIN transactions t ON t.id=m.financial_transaction_id
      WHERE m.cost_center_id=$1 AND m.movement_date<$2 AND ${effective}),0) AS saidas`, [id,end]);
  const r = rows[0];
  const cents = (n) => Math.round(Number(n || 0) * 100);
  const planned = (await db.query(`SELECT rt.id,rt.amount,rt.frequency,rt.day_of_month,rt.total_installments,rt.legacy_generated_through,
      to_char(COALESCE(rt.starts_on,date_trunc('month',rt.created_at AT TIME ZONE 'America/Sao_Paulo')::date),'YYYY-MM') AS inicio,
      to_char(p.period,'YYYY-MM') AS mes,
      EXISTS(SELECT 1 FROM transactions t WHERE t.recurring_template_id=rt.id AND t.recurring_period=p.period AND t.deleted_at IS NULL) AS generated
    FROM recurring_templates rt JOIN maintenance_periods p ON p.cost_center_id=rt.cost_center_id
    WHERE rt.cost_center_id=$1 AND rt.active=TRUE AND rt.type='despesa' AND p.period<$2`, [id,end])).rows;
  const previstos = planned.reduce((sum, item) => {
    const occurrence = ocorrencia(item,item.mes);
    return occurrence && !item.generated && occurrence.parcela > Number(item.legacy_generated_through || 0) ? sum + cents(item.amount) : sum;
  },0);
  return { mensalidades:Number(r.mensalidades), despesas:Number(r.despesas), recorrentes_previstos:previstos/100, entradas:Number(r.entradas), saidas:Number(r.saidas),
    saldo:(cents(r.mensalidades) - cents(r.despesas) - previstos + cents(r.entradas) - cents(r.saidas)) / 100 };
}

async function ensurePeriods(db, center, month = currentMonth()) {
  if (!center.active) return 0;
  const first = String(center.start_date || center.created_date || `${month}-01`).slice(0, 7);
  const last = center.end_date && String(center.end_date).slice(0, 7) < month ? String(center.end_date).slice(0, 7) : month;
  if (first > last) return 0;
  const monthIndex = (m) => Number(m.slice(0,4))*12 + Number(m.slice(5,7));
  if (monthIndex(last) - monthIndex(first) > 600) throw httpError(400, 'A vigência de manutenção ultrapassa 50 anos.');
  await assertOpenPeriods(db,center.id,first,last);
  const result = await db.query(`INSERT INTO maintenance_periods(cost_center_id,period,monthly_amount)
    SELECT $1,d::date,$4 FROM generate_series($2::date,$3::date,interval '1 month') AS d
    WHERE NOT EXISTS (SELECT 1 FROM maintenance_periods p WHERE p.cost_center_id=$1 AND p.period=d::date)
    ON CONFLICT(cost_center_id,period) DO NOTHING RETURNING id`, [center.id,`${first}-01`,`${last}-01`,center.monthly_budget]);
  return result.rowCount;
}

async function skipInactivePeriods(db, center, month = currentMonth()) {
  const last = (await db.query("SELECT to_char(MAX(period),'YYYY-MM') AS mes FROM maintenance_periods WHERE cost_center_id=$1", [center.id])).rows[0].mes;
  const previous = require('./recurringSchedule').somarMeses(month,-1);
  const first = last ? require('./recurringSchedule').somarMeses(last,1) : String(center.start_date || center.created_date || `${month}-01`).slice(0,7);
  const end = center.end_date && center.end_date.slice(0,7) < previous ? center.end_date.slice(0,7) : previous;
  if (first > end) return;
  const diff = (Number(end.slice(0,4))-Number(first.slice(0,4)))*12 + Number(end.slice(5,7))-Number(first.slice(5,7));
  if (diff > 600) throw httpError(400, 'A vigência de manutenção ultrapassa 50 anos.');
  await assertOpenPeriods(db,center.id,first,end);
  await db.query(`INSERT INTO maintenance_periods(cost_center_id,period,monthly_amount)
    SELECT $1,d::date,0 FROM generate_series($2::date,$3::date,interval '1 month') d
    WHERE NOT EXISTS (SELECT 1 FROM maintenance_periods p WHERE p.cost_center_id=$1 AND p.period=d::date)
    ON CONFLICT(cost_center_id,period) DO NOTHING`, [center.id,`${first}-01`,`${end}-01`]);
}

module.exports = { balance, ensurePeriods, skipInactivePeriods, effective };
