'use strict';
const crypto = require('crypto');
const { getDb, getInstanceIdentity } = require('../db');
const { findReplay, isClientIdConflict } = require('./transactionIdempotency');

async function insertTransaction(data, user, clientId, db = getDb(), ignoreConflict = false) {
  const instance = getInstanceIdentity();
  const { rows } = await db.query(
    `INSERT INTO transactions
      (public_id,type,cost_center_id,category_id,description,counterparty,amount,transaction_date,notes,
       due_date,settlement_date,financial_status,document_number,payment_method,
       origin_instance_id,origin_instance_name,last_modified_instance_id,last_modified_instance_name,
       origin_user_name,created_by,client_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$15,$16,$17,$18,$19)
     ${ignoreConflict ? 'ON CONFLICT DO NOTHING' : ''} RETURNING id,public_id`,
    [crypto.randomUUID(),data.type,data.costCenterId,data.categoryId,data.description,data.counterparty,
      data.amount,data.date,data.notes,data.dueDate,data.settlementDate,data.financialStatus,
      data.documentNumber,data.paymentMethod,instance.id,instance.name,user.name,user.id,clientId]
  ).catch(async (error) => { // reenvio simultâneo do mesmo lançamento: devolve o primeiro
    if (ignoreConflict || !isClientIdConflict(error)) throw error;
    return { rows: [await findReplay(db, user.id, clientId, data)] };
  });
  return rows[0];
}
module.exports = { insertTransaction };
