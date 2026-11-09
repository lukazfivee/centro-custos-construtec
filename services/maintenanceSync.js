const { httpError } = require('../lib/http');
const { validMonth, currentMonth, monthRange } = require('../lib/dates');
const crypto = require('crypto');
const { balance } = require('./maintenanceBalance');

function periodId(center, month) {
  const hash = crypto.createHash('sha256').update(`${center}:${month}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

async function exportPeriods(db) {
  const { rows } = await db.query(`SELECT cc.public_id AS center, to_char(p.period,'YYYY-MM') AS month,
    p.monthly_amount AS amount,p.paid,p.revision,p.created_at,p.updated_at
    FROM maintenance_periods p JOIN cost_centers cc ON cc.id=p.cost_center_id ORDER BY cc.public_id,p.period`);
  return rows.map((r) => ({ publicId:periodId(r.center,r.month), center:r.center, month:r.month, amount:String(r.amount), paid:r.paid,
    revision:Number(r.revision), createdAt:new Date(r.created_at).toISOString(), updatedAt:new Date(r.updated_at).toISOString() }));
}

async function importPeriods(tx, periods) {
  if (!Array.isArray(periods) || periods.length > 100000) throw httpError(400, 'Competências de manutenção inválidas.');
  for (const p of periods) {
    if (!p || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(p.center || '')) || !validMonth(p.month) || p.month.startsWith('0000-') || !/^\d{1,12}(\.\d{1,2})?$/.test(String(p.amount)) ||
      typeof p.paid !== 'boolean' || !Number.isSafeInteger(p.revision) || p.revision < 1 || !Number.isFinite(Date.parse(p.createdAt)) || !Number.isFinite(Date.parse(p.updatedAt))) {
      throw httpError(400, 'Competência de manutenção inválida no pacote.');
    }
    if (p.publicId && p.publicId !== periodId(p.center,p.month)) throw httpError(400, 'Identificador da competência inválido.');
    const c = (await tx.query('SELECT id,kind FROM cost_centers WHERE public_id=$1 FOR UPDATE', [p.center])).rows[0];
    if (!c || c.kind !== 'contrato_manutencao') throw httpError(409, 'Competência aponta para contrato de manutenção indisponível.');
    const local = (await tx.query('SELECT * FROM maintenance_periods WHERE cost_center_id=$1 AND period=$2 FOR UPDATE', [c.id, `${p.month}-01`])).rows[0];
    if (!local) {
      if (await require('./financialPolicy').isMonthClosed(`${p.month}-01`,tx)) throw httpError(403, `A competência ${p.month} está fechada.`);
      await tx.query(`INSERT INTO maintenance_periods(cost_center_id,period,monthly_amount,paid,revision,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [c.id, `${p.month}-01`, p.amount, p.paid, p.revision, p.createdAt, p.updatedAt]);
    } else if (Number(local.monthly_amount) !== Number(p.amount)) {
      throw httpError(409, `Valor divergente na competência ${p.month}; o pacote não foi importado.`);
    } else if (local.paid !== p.paid) {
      if (p.revision <= Number(local.revision)) throw httpError(409, `Recebimento divergente na competência ${p.month}; o pacote não foi importado.`);
      await tx.query('UPDATE maintenance_periods SET paid=$1,revision=$2,updated_at=$3 WHERE id=$4', [p.paid,p.revision,p.updatedAt,local.id]);
    } else if (p.revision > Number(local.revision)) {
      await tx.query('UPDATE maintenance_periods SET revision=$1,updated_at=$2 WHERE id=$3', [p.revision,p.updatedAt,local.id]);
    }
  }
}

async function exportMovements(db) {
  const { rows } = await db.query(`SELECT m.public_id,c.public_id AS center,d.public_id AS destination,
    t.public_id AS transaction,m.amount,m.movement_date::text AS date,m.reversal_of,m.created_at
    FROM maintenance_movements m JOIN cost_centers c ON c.id=m.cost_center_id
    LEFT JOIN cost_centers d ON d.id=m.destination_id LEFT JOIN transactions t ON t.id=m.financial_transaction_id ORDER BY m.id`);
  return rows.map((r) => ({ publicId:r.public_id,center:r.center,destination:r.destination,transaction:r.transaction,
    amount:String(r.amount),date:r.date,reversalOf:r.reversal_of,revision:1,updatedAt:new Date(r.created_at).toISOString() }));
}

async function importMovements(db, movements, user) {
  if (!Array.isArray(movements) || movements.length > 100000) throw httpError(400, 'Destinações de manutenção inválidas.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const m of [...movements].sort((a,b) => String(a?.date || '').localeCompare(String(b?.date || '')) || String(a?.updatedAt || '').localeCompare(String(b?.updatedAt || '')) || Number(Boolean(a?.reversalOf))-Number(Boolean(b?.reversalOf)))) {
    if (!m || !uuid.test(String(m.publicId)) || !uuid.test(String(m.center)) ||
      Boolean(m.destination) === Boolean(m.transaction) || !uuid.test(String(m.destination || m.transaction)) ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(String(m.amount)) || Number(m.amount) <= 0 ||
      !require('../lib/dates').validDate(m.date) || !Number.isFinite(Date.parse(m.updatedAt)) || Number(m.revision) !== 1 || (m.reversalOf && !uuid.test(String(m.reversalOf)))) throw httpError(400, 'Destinação inválida no pacote.');
    const c = (await db.query('SELECT id,kind FROM cost_centers WHERE public_id=$1 FOR UPDATE', [m.center])).rows[0];
    const d = m.destination ? (await db.query('SELECT id,kind FROM cost_centers WHERE public_id=$1 FOR UPDATE', [m.destination])).rows[0] : null;
    const t = m.transaction ? (await db.query(`SELECT id,type,cost_center_id,amount,transaction_date::text AS date,deleted_at,
      EXISTS(SELECT 1 FROM transactions r WHERE r.reversal_of=transactions.public_id AND r.deleted_at IS NULL AND r.transaction_date<$2) AS reversed
      FROM transactions WHERE public_id=$1`, [m.transaction,monthRange(currentMonth()).end])).rows[0] : null;
    if (!c || c.kind !== 'contrato_manutencao' || (m.destination && (!d || d.id === c.id)) ||
      (m.transaction && (!t || t.type !== 'receita' || Number(t.cost_center_id) !== Number(c.id) || Number(t.amount) !== Number(m.amount) || t.date !== m.date))) throw httpError(409, 'Destinação aponta para centro ou receita incompatível.');
    const local = (await db.query('SELECT * FROM maintenance_movements WHERE public_id=$1', [m.publicId])).rows[0];
    if (local) {
      const localDate = local.movement_date instanceof Date ? local.movement_date.toISOString().slice(0,10) : String(local.movement_date).slice(0,10);
      if (Number(local.cost_center_id) !== Number(c.id) || Number(local.destination_id || 0) !== Number(d?.id || 0) || Number(local.financial_transaction_id || 0) !== Number(t?.id || 0) || Number(local.amount) !== Number(m.amount) || localDate !== m.date || (local.reversal_of || null) !== (m.reversalOf || null)) throw httpError(409, 'Destinação divergente no pacote.');
      continue;
    }
    if (await require('./financialPolicy').isMonthClosed(m.date,db)) throw httpError(403, `A competência da destinação ${m.date.slice(0,7)} está fechada.`);
    if (m.reversalOf) {
      const original = (await db.query('SELECT * FROM maintenance_movements WHERE public_id=$1', [m.reversalOf])).rows[0];
      if (!original || original.reversal_of || original.financial_transaction_id || Number(original.cost_center_id) !== Number(c.id) || Number(original.destination_id) !== Number(d?.id) || Number(original.amount) !== Number(m.amount)) throw httpError(409, 'Estorno de destinação incompatível.');
      if (d.kind === 'contrato_manutencao' && Math.round((await balance(db,d.id)).saldo*100) < Math.round(Number(m.amount)*100)) throw httpError(409, 'O contrato de destino já utilizou esta verba.');
    } else if ((!t || (!t.deleted_at && !t.reversed)) && Math.round((await balance(db,c.id)).saldo * 100) < Math.round(Number(m.amount)*100)) {
      throw httpError(409, 'Destinação recebida excede o saldo disponível; revise as alterações nas instalações.');
    }
    await db.query(`INSERT INTO maintenance_movements(public_id,cost_center_id,destination_id,financial_transaction_id,amount,movement_date,reversal_of,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [m.publicId,c.id,d?.id || null,t?.id || null,m.amount,m.date,m.reversalOf || null,user.id]);
  }
}

module.exports = { exportPeriods, importPeriods, exportMovements, importMovements };
