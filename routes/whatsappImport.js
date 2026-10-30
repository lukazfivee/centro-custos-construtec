'use strict';
const express = require('express');
const { getDb, getInstanceIdentity } = require('../db');
const { autenticar } = require('../middleware/auth');
const { exigirPermissao, can } = require('../services/permissions');
const { LINKED_TABLES } = require('../services/costCenterLinks');
const { assertObra, obrasPermitidas } = require('../services/obraScope');
const { isMonthClosed } = require('../services/financialPolicy');
const { recordAudit } = require('../services/audit');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { importar } = require('../services/whatsappImport');
const router = express.Router();
router.use(autenticar, exigirPermissao('p2'));
router.post('/', asyncRoute(async (req,res) => res.status(201).json(await importar(req,req.body.texto,req.body.itens))));
router.get('/', asyncRoute(async (req,res) => {
  const {rows} = await getDb().query('SELECT public_id AS id,created_at FROM whatsapp_imports WHERE user_id=$1 ORDER BY id DESC LIMIT 30',[req.usuario.id]);
  res.json(rows);
}));
router.get('/:id', asyncRoute(async (req,res) => {
  const db = getDb();
  const owner = (await db.query('SELECT id,public_id,pending_items,source_text FROM whatsapp_imports WHERE public_id::text=$1 AND user_id=$2',[req.params.id,req.usuario.id])).rows[0];
  if (!owner) throw httpError(404,'Importação não encontrada.');
  const allowed = await obrasPermitidas(req);
  const rows = (await db.query(`SELECT wi.id AS "itemId",t.id,t.public_id,t.description AS descricao,t.amount AS valor,
    t.deleted_at,cc.id AS center_id,cc.name AS centro,wi.created_cost_center_id
    FROM whatsapp_import_items wi JOIN transactions t ON t.id=wi.transaction_id
    JOIN cost_centers cc ON cc.id=t.cost_center_id WHERE wi.import_id=$1 ORDER BY wi.id`,[owner.id])).rows
    .filter(row => !allowed || allowed.includes(Number(row.center_id)));
  res.json({importId:owner.public_id,texto:allowed === null ? owner.source_text : null,lancados:rows.map(row => ({...row,excluido:Boolean(row.deleted_at)})),pendencias:owner.pending_items || [],centrosCriados:rows.filter(row => row.created_cost_center_id).map(row => ({id:row.center_id,nome:row.centro}))});
}));
async function undo(req,res) {
  const db = getDb();
  const imports = await db.query('SELECT id FROM whatsapp_imports WHERE public_id::text=$1 AND user_id=$2',[req.params.id,req.usuario.id]);
  if (!imports.rows[0]) throw httpError(404,'Importação não encontrada.');
  const itemId = req.params.itemId ? positiveId(req.params.itemId) : null;
  const rows = (await db.query(`SELECT wi.id,t.id AS transaction_id,t.cost_center_id FROM whatsapp_import_items wi JOIN transactions t ON t.id=wi.transaction_id WHERE wi.import_id=$1 AND ($2::integer IS NULL OR wi.id=$2)`,[imports.rows[0].id,itemId])).rows;
  if (itemId && !rows.length) throw httpError(404,'Item não encontrado.');
  for (const row of rows) await assertObra(req,row.cost_center_id);
  const podeInativar = await can(req.usuario, 'p5');
  const result = await db.transaction(async tx => {
    await tx.query('LOCK TABLE monthly_closings IN SHARE MODE');
    let removed=0; const pendencias=[], centrosInativados=[];
    for (const item of rows) {
      const row = (await tx.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE',[item.transaction_id])).rows[0];
      if (!row || row.deleted_at) continue;
      if (row.financial_status !== 'pendente' || row.reversal_of || row.reversed_at || await isMonthClosed(row.transaction_date,tx)) { pendencias.push({itemId:item.id,motivo:'Lançamento liquidado, estornado ou em competência fechada.'}); continue; }
      const instance=getInstanceIdentity();
      await tx.query('UPDATE transactions SET deleted_at=NOW(),updated_at=NOW(),revision=revision+1,last_modified_instance_id=$1,last_modified_instance_name=$2,updated_by=$3 WHERE id=$4',[instance.id,instance.name,req.usuario.id,row.id]);
      await recordAudit({entityType:'lancamento',entityId:row.public_id,action:'excluido',summary:`Lançamento enviado para a lixeira: ${row.description}`,user:req.usuario,client:tx});
      removed++;
    }
    if (podeInativar && removed) {
      const created = (await tx.query('SELECT DISTINCT created_cost_center_id AS id FROM whatsapp_import_items WHERE import_id=$1 AND created_cost_center_id IS NOT NULL', [imports.rows[0].id])).rows;
      for (const c of created) {
        const center = (await tx.query('SELECT id,name,active,revision FROM cost_centers WHERE id=$1 FOR UPDATE', [c.id])).rows[0];
        if (!center || !center.active || Number(center.revision) !== 1) continue;
        const live = await tx.query('SELECT 1 FROM transactions WHERE cost_center_id=$1 AND deleted_at IS NULL LIMIT 1', [c.id]);
        if (live.rows.length) continue;
        let linked = false;
        for (const [table] of LINKED_TABLES) {
          if (table === 'transactions') continue;
          if ((await tx.query(`SELECT 1 FROM ${table} WHERE cost_center_id=$1 LIMIT 1`,[c.id])).rows.length) { linked = true; break; }
        }
        if (linked) continue;
        await tx.query('UPDATE cost_centers SET active=false,revision=revision+1,updated_at=NOW() WHERE id=$1',[c.id]);
        await recordAudit({entityType:'obra',entityId:c.id,action:'atualizada',summary:`Centro inativado após desfazer importação: ${center.name}`,user:req.usuario,client:tx});
        centrosInativados.push({id:c.id,nome:center.name});
      }
    }
    return { removidos:removed,pendencias,centrosInativados };
  });
  res.json(result);
}
router.delete('/:id/itens/:itemId',asyncRoute(undo));
router.delete('/:id',asyncRoute(undo));
module.exports = router;
