const crypto = require('crypto');
const express = require('express');
const { getDb } = require('../db');
const { autenticar } = require('../middleware/auth');
const { exigirPermissao } = require('../services/permissions');
const { assertObra } = require('../services/obraScope');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { todayIso } = require('../lib/dates');
const { moneyCents, isMonthClosed } = require('../services/financialPolicy');
const { insertTransaction } = require('../lib/transactionInsert');
const { recordAudit } = require('../services/audit');
const { balance, ensurePeriods } = require('../services/maintenanceBalance');
const { readClientId } = require('../lib/transactionIdempotency');

const router = express.Router();
router.use(autenticar);

async function lockCenter(db, id) {
  const row = (await db.query(`SELECT id,code,name,client,kind,active,monthly_budget,start_date::text,end_date::text,
    (created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS created_date FROM cost_centers WHERE id=$1 FOR UPDATE`, [id])).rows[0];
  if (!row || row.kind !== 'contrato_manutencao') throw httpError(404, 'Contrato de manutenção não encontrado.');
  return row;
}

async function prepare(db, id, user) {
  const center = await lockCenter(db, id);
  const count = await ensurePeriods(db, center);
  if (count) await recordAudit({ entityType:'contrato_manutencao', entityId:id, action:'competencias_criadas',
    summary:`Competências geradas para ${center.code}`, data:{ quantidade:count }, user, client:db });
  return center;
}

router.get('/:id/manutencao-resumo', exigirPermissao('p1'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  await assertObra(req, id);
  const result = await getDb().transaction(async (tx) => {
    await tx.query('UPDATE financial_write_gate SET revision=revision+1 WHERE id=1');
    await prepare(tx, id, req.usuario);
    const totals = await balance(tx, id);
    const { rows } = await tx.query(`SELECT m.public_id,m.amount AS valor,m.movement_date::text AS data,m.reversal_of AS estorno_de,
      d.name AS destino,t.public_id AS lancamento,t.financial_status AS situacao_financeira,t.deleted_at,
      EXISTS(SELECT 1 FROM transactions r WHERE r.reversal_of=t.public_id AND r.deleted_at IS NULL) AS receita_estornada
      FROM maintenance_movements m LEFT JOIN cost_centers d ON d.id=m.destination_id
      LEFT JOIN transactions t ON t.id=m.financial_transaction_id WHERE m.cost_center_id=$1 ORDER BY m.id DESC`, [id]);
    return { ...totals, movimentos:rows };
  });
  res.json(result);
}));

router.post('/:id/manutencao-movimentos', exigirPermissao('p4'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const destination = req.body?.destino === 'financeiro' ? null : positiveId(req.body?.centro_destino, 'Centro de destino');
  if (req.body?.destino !== 'financeiro' && req.body?.destino !== 'centro') throw httpError(400, 'Escolha o destino da sobra.');
  if (destination === id) throw httpError(400, 'Escolha outro centro de custo.');
  const cents = moneyCents(req.body?.valor);
  const publicId = readClientId(req.body) || crypto.randomUUID();
  await assertObra(req, id);
  if (destination) await assertObra(req, destination);
  const result = await getDb().transaction(async (tx) => {
    await tx.query('LOCK TABLE recurring_templates IN SHARE ROW EXCLUSIVE MODE');
    await tx.query('UPDATE financial_write_gate SET revision=revision+1 WHERE id=1');
    const old = (await tx.query('SELECT cost_center_id,destination_id,amount FROM maintenance_movements WHERE public_id=$1', [publicId])).rows[0];
    if (old) {
      if (Number(old.cost_center_id) !== id || (old.destination_id == null ? null : Number(old.destination_id)) !== destination || Math.round(Number(old.amount)*100) !== cents) throw httpError(409, 'Identificador já usado em outra destinação.');
      return { publicId, repetido:true };
    }
    const c = await prepare(tx, id, req.usuario);
    if (!c.active) throw httpError(409, 'Contrato inativo.');
    const date = todayIso();
    if (await isMonthClosed(date, tx)) throw httpError(403, 'A competência atual está fechada.');
    if (destination) {
      const d = (await tx.query('SELECT id,active FROM cost_centers WHERE id=$1 FOR UPDATE', [destination])).rows[0];
      if (!d || !d.active) throw httpError(400, 'Centro de destino inexistente ou inativo.');
    }
    const available = await balance(tx, id);
    if (Math.round(available.saldo * 100) < cents) throw httpError(409, 'O valor supera o saldo disponível do contrato.');
    let financial = null;
    if (!destination) {
      const category = (await tx.query("SELECT id FROM categories WHERE active AND type IN ('receita','ambos') ORDER BY (lower(name)='vendas e serviços') DESC,id LIMIT 1")).rows[0];
      if (!category) throw httpError(409, 'Cadastre uma categoria de receita ativa.');
      financial = await insertTransaction({ type:'receita',costCenterId:id,categoryId:category.id,description:`Sobra do contrato ${c.code}`,
        counterparty:c.client,amount:cents/100,date,notes:'Destinação de saldo do contrato de manutenção.',dueDate:date,settlementDate:null,
        financialStatus:'pendente',documentNumber:null,paymentMethod:null }, req.usuario, null, tx);
      await recordAudit({ entityType:'lancamento',entityId:financial.public_id,action:'criado',summary:`Receita pendente da sobra do contrato ${c.code}`,
        data:{ valor:cents/100,centro:id,movimento:publicId },user:req.usuario,client:tx });
    }
    await tx.query(`INSERT INTO maintenance_movements(public_id,cost_center_id,destination_id,financial_transaction_id,amount,movement_date,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [publicId,id,destination,financial?.id || null,cents/100,date,req.usuario.id]);
    await recordAudit({ entityType:'contrato_manutencao',entityId:id,action:'saldo_destinado',summary:`Saldo destinado do contrato ${c.code}`,
      data:{ movimento:publicId,destino:destination || 'financeiro',valor:cents/100,lancamento:financial?.public_id || null },user:req.usuario,client:tx });
    return { publicId,lancamento:financial?.public_id || null,repetido:false };
  });
  res.status(result.repetido ? 200 : 201).json(result);
}));

router.post('/:id/manutencao-movimentos/:movimento/estornar', exigirPermissao('p4'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const movement = String(req.params.movimento || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(movement)) throw httpError(400, 'Movimento inválido.');
  await assertObra(req, id);
  await getDb().transaction(async (tx) => {
    await tx.query('UPDATE financial_write_gate SET revision=revision+1 WHERE id=1');
    const c = await lockCenter(tx, id);
    const m = (await tx.query('SELECT * FROM maintenance_movements WHERE public_id=$1 AND cost_center_id=$2 FOR UPDATE', [movement,id])).rows[0];
    if (!m || m.reversal_of) throw httpError(404, 'Destinação não encontrada.');
    if (m.financial_transaction_id) throw httpError(409, 'Cancele ou estorne a receita no Financeiro para devolver o saldo.');
    await assertObra(req, m.destination_id);
    const destination = (await tx.query('SELECT kind FROM cost_centers WHERE id=$1 FOR UPDATE', [m.destination_id])).rows[0];
    if (destination?.kind === 'contrato_manutencao' && Math.round((await balance(tx,m.destination_id)).saldo*100) < Math.round(Number(m.amount)*100)) throw httpError(409, 'O contrato de destino já utilizou esta verba.');
    if ((await tx.query('SELECT 1 FROM maintenance_movements WHERE reversal_of=$1', [movement])).rows.length) throw httpError(409, 'Esta destinação já foi estornada.');
    const date = todayIso();
    if (await isMonthClosed(date, tx)) throw httpError(403, 'A competência atual está fechada.');
    await tx.query(`INSERT INTO maintenance_movements(public_id,cost_center_id,destination_id,amount,movement_date,reversal_of,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [crypto.randomUUID(),id,m.destination_id,m.amount,date,m.public_id,req.usuario.id]);
    await recordAudit({ entityType:'contrato_manutencao',entityId:id,action:'destinacao_estornada',summary:`Destinação estornada: ${c.code}`,
      data:{ movimento:movement,valor:Number(m.amount) },user:req.usuario,client:tx });
  });
  res.json({ ok:true });
}));

module.exports = router;
