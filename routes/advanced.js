const crypto = require('crypto');
const express = require('express');
const { getDb, getInstanceIdentity } = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const { validDate } = require('../lib/dates');
const { recordAudit } = require('../services/audit');

const router = express.Router();
router.use(autenticar);

function asMoney(value, name = 'valor') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw httpError(400, `${name} inválido.`);
  return Math.round(n * 100) / 100;
}
function clean(value, max = 180) { return String(value ?? '').trim().slice(0, max); }
async function ensureOpenTransaction(id) {
  const { rows } = await getDb().query(`
    SELECT t.id,t.public_id,t.amount,t.type,t.transaction_date::text AS data,t.financial_status,
      t.reversal_of,t.reversed_at,t.deleted_at
    FROM transactions t WHERE t.id=$1`, [id]);
  const row = rows[0];
  if (!row || row.deleted_at) throw httpError(404, 'Lançamento não encontrado.');
  if (row.reversal_of || row.reversed_at) throw httpError(409, 'Lançamento de estorno ou já estornado não pode ser alterado por esta operação.');
  const d = new Date(`${row.data}T12:00:00`);
  const closed = await getDb().query('SELECT id FROM monthly_closings WHERE year=$1 AND month=$2', [d.getFullYear(), d.getMonth() + 1]);
  if (closed.rows[0]) throw httpError(403, 'A competência deste lançamento está fechada.');
  return row;
}

router.get('/inteligencia/resumo', asyncRoute(async (req, res) => {
  const centerId = Number(req.query.centro_id) || null;
  const params = centerId ? [centerId] : [];
  const centerWhere = centerId ? ' AND t.cost_center_id=$1' : '';
  const [alerts, cashflow, abc, centers, documents, duplicateCandidates] = await Promise.all([
    getDb().query(`
      SELECT
        COUNT(*) FILTER (WHERE t.financial_status='pendente' AND t.due_date<CURRENT_DATE)::int AS vencidos,
        COALESCE(SUM(t.amount) FILTER (WHERE t.financial_status='pendente' AND t.due_date<CURRENT_DATE),0) AS valor_vencido,
        COUNT(*) FILTER (WHERE t.financial_status='pendente' AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7)::int AS vence_7,
        COUNT(*) FILTER (WHERE t.financial_status='pendente' AND t.due_date BETWEEN CURRENT_DATE+8 AND CURRENT_DATE+30)::int AS vence_30
      FROM transactions t WHERE t.deleted_at IS NULL AND t.accounting_sign=1 ${centerWhere}`, params),
    getDb().query(`
      SELECT horizon,
        COALESCE(SUM(CASE WHEN t.type='receita' THEN t.amount ELSE -t.amount END),0) AS saldo_projetado
      FROM (VALUES (7),(15),(30),(60),(90)) AS h(horizon)
      LEFT JOIN transactions t ON t.deleted_at IS NULL AND t.accounting_sign=1 AND t.financial_status='pendente'
        AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + h.horizon ${centerId ? 'AND t.cost_center_id=$1' : ''}
      GROUP BY horizon ORDER BY horizon`, params),
    getDb().query(`
      SELECT c.name AS categoria,COUNT(*)::int AS quantidade,COALESCE(SUM(t.amount),0) AS valor
      FROM transactions t JOIN categories c ON c.id=t.category_id
      WHERE t.deleted_at IS NULL AND t.accounting_sign=1 AND t.type='despesa'
        AND t.transaction_date>=CURRENT_DATE-INTERVAL '365 days' ${centerWhere}
      GROUP BY c.id,c.name ORDER BY valor DESC LIMIT 10`, params),
    getDb().query(`
      SELECT cc.id,cc.code,cc.name,cc.monthly_budget AS orcamento,
        COALESCE(SUM(CASE WHEN t.type='despesa' THEN t.amount*t.accounting_sign ELSE 0 END),0) AS realizado,
        CASE WHEN cc.monthly_budget>0 THEN ROUND((COALESCE(SUM(CASE WHEN t.type='despesa' THEN t.amount*t.accounting_sign ELSE 0 END),0)/cc.monthly_budget)*100,2) ELSE 0 END AS comprometimento
      FROM cost_centers cc LEFT JOIN transactions t ON t.cost_center_id=cc.id AND t.deleted_at IS NULL
      WHERE cc.active=TRUE ${centerId ? 'AND cc.id=$1' : ''}
      GROUP BY cc.id,cc.code,cc.name,cc.monthly_budget ORDER BY comprometimento DESC`, params),
    getDb().query(`
      SELECT COUNT(*)::int AS sem_documento
      FROM transactions t
      WHERE t.deleted_at IS NULL AND t.accounting_sign=1 AND t.type='despesa'
        AND NOT EXISTS (SELECT 1 FROM transaction_attachments a WHERE a.transaction_id=t.id) ${centerWhere}`, params),
    getDb().query(`
      SELECT COUNT(*)::int AS possiveis
      FROM transactions a JOIN transactions b ON b.id>a.id AND b.deleted_at IS NULL AND b.accounting_sign=1
        AND a.deleted_at IS NULL AND a.accounting_sign=1 AND a.type=b.type AND a.amount=b.amount
        AND COALESCE(LOWER(a.counterparty),'')=COALESCE(LOWER(b.counterparty),'')
        AND ABS(a.transaction_date-b.transaction_date)<=2
      WHERE 1=1 ${centerId ? 'AND a.cost_center_id=$1' : ''}`, params),
  ]);
  res.json({
    atencao:{...alerts.rows[0],sem_documento:Number(documents.rows[0]?.sem_documento||0),possiveis_duplicidades:Number(duplicateCandidates.rows[0]?.possiveis||0)},
    fluxo:cashflow.rows.map((r)=>({dias:Number(r.horizon),saldo:Number(r.saldo_projetado)})),
    curvaABC:abc.rows.map((r)=>({...r,valor:Number(r.valor)})),
    obras:centers.rows.map((r)=>({...r,orcamento:Number(r.orcamento),realizado:Number(r.realizado),comprometimento:Number(r.comprometimento)})),
  });
}));

router.get('/sugestoes', asyncRoute(async (req, res) => {
  const favorecido = clean(req.query.favorecido, 160);
  const descricao = clean(req.query.descricao, 240);
  if (!favorecido && descricao.length < 3) return res.json({ sugestoes:[] });
  const terms = [];
  const values = [];
  if (favorecido) { values.push(favorecido.toLowerCase()); terms.push(`LOWER(COALESCE(t.counterparty,''))=$${values.length}`); }
  if (descricao.length >= 3) { values.push(`%${descricao.toLowerCase()}%`); terms.push(`LOWER(t.description) LIKE $${values.length}`); }
  const { rows } = await getDb().query(`
    SELECT t.category_id,c.name AS categoria,t.cost_center_id,cc.code AS centro_codigo,cc.name AS centro_nome,
      t.counterparty AS favorecido,COUNT(*)::int AS frequencia,ROUND(AVG(t.amount),2) AS media,
      MIN(t.amount) AS minimo,MAX(t.amount) AS maximo,MAX(t.transaction_date)::text AS ultima_data
    FROM transactions t JOIN categories c ON c.id=t.category_id JOIN cost_centers cc ON cc.id=t.cost_center_id
    WHERE t.deleted_at IS NULL AND t.accounting_sign=1 AND (${terms.join(' OR ')})
    GROUP BY t.category_id,c.name,t.cost_center_id,cc.code,cc.name,t.counterparty
    ORDER BY frequencia DESC,ultima_data DESC LIMIT 5`, values);
  res.json({ sugestoes:rows.map((r)=>({...r,media:Number(r.media),minimo:Number(r.minimo),maximo:Number(r.maximo)})) });
}));

router.post('/lancamentos/acoes-em-massa', exigirPapel('admin','gestor'), asyncRoute(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))];
  if (!ids.length || ids.length > 200) throw httpError(400, 'Selecione de 1 a 200 lançamentos.');
  const action = clean(req.body.acao, 40);
  const allowed = ['categoria','centro','forma_pagamento','liquidar'];
  if (!allowed.includes(action)) throw httpError(400, 'Ação em massa inválida.');
  for (const id of ids) await ensureOpenTransaction(id);
  const db = getDb();
  const instance = getInstanceIdentity();
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const id of ids) {
      let result;
      if (action === 'categoria') {
        const value = positiveId(req.body.valor);
        result = await tx.query(`UPDATE transactions SET category_id=$1,revision=revision+1,updated_at=NOW(),updated_by=$2,last_modified_instance_id=$3,last_modified_instance_name=$4 WHERE id=$5`, [value,req.usuario.id,instance.id,instance.name,id]);
      } else if (action === 'centro') {
        const value = positiveId(req.body.valor);
        result = await tx.query(`UPDATE transactions SET cost_center_id=$1,revision=revision+1,updated_at=NOW(),updated_by=$2,last_modified_instance_id=$3,last_modified_instance_name=$4 WHERE id=$5`, [value,req.usuario.id,instance.id,instance.name,id]);
      } else if (action === 'forma_pagamento') {
        const value = clean(req.body.valor, 40);
        if (!value) throw httpError(400, 'Informe a forma de pagamento.');
        result = await tx.query(`UPDATE transactions SET payment_method=$1,revision=revision+1,updated_at=NOW(),updated_by=$2,last_modified_instance_id=$3,last_modified_instance_name=$4 WHERE id=$5`, [value,req.usuario.id,instance.id,instance.name,id]);
      } else {
        const settlement = clean(req.body.data || new Date().toISOString().slice(0,10), 10);
        if (!validDate(settlement)) throw httpError(400, 'Data de liquidação inválida.');
        result = await tx.query(`UPDATE transactions SET financial_status='liquidado',settlement_date=$1,revision=revision+1,updated_at=NOW(),updated_by=$2,last_modified_instance_id=$3,last_modified_instance_name=$4 WHERE id=$5`, [settlement,req.usuario.id,instance.id,instance.name,id]);
      }
      changed += Number(result.rowCount || 0);
    }
    await recordAudit({ entityType:'lancamento',action:'acao_em_massa',summary:`Ação em massa '${action}' aplicada a ${changed} lançamento(s).`,data:{ids,action,valor:req.body.valor||null},user:req.usuario,client:tx });
  });
  res.json({ok:true,alterados:changed});
}));

router.get('/rateios/:id', asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const { rows } = await getDb().query(`
    SELECT a.id,a.cost_center_id,cc.code AS centro_codigo,cc.name AS centro_nome,a.amount AS valor,a.percentage AS percentual
    FROM transaction_allocations a JOIN cost_centers cc ON cc.id=a.cost_center_id
    WHERE a.transaction_id=$1 ORDER BY a.id`, [id]);
  res.json(rows.map((r)=>({...r,valor:Number(r.valor),percentual:Number(r.percentual)})));
}));

router.put('/rateios/:id', exigirPapel('admin','gestor'), asyncRoute(async (req, res) => {
  const id = positiveId(req.params.id);
  const txRow = await ensureOpenTransaction(id);
  const allocations = Array.isArray(req.body.rateios) ? req.body.rateios : [];
  if (allocations.length < 2 || allocations.length > 20) throw httpError(400, 'O rateio deve ter entre 2 e 20 centros de custo.');
  const normalized = allocations.map((a)=>({ costCenterId:positiveId(a.cost_center_id), amount:asMoney(a.valor) }));
  const sum = normalized.reduce((acc,a)=>acc+a.amount,0);
  if (Math.abs(sum-Number(txRow.amount))>0.01) throw httpError(400, `A soma dos rateios deve ser igual a ${Number(txRow.amount).toFixed(2)}.`);
  if (new Set(normalized.map((a)=>a.costCenterId)).size !== normalized.length) throw httpError(400, 'Não repita o mesmo centro de custo no rateio.');
  await getDb().transaction(async (tx)=>{
    await tx.query('DELETE FROM transaction_allocations WHERE transaction_id=$1',[id]);
    for (const a of normalized) await tx.query(`INSERT INTO transaction_allocations (transaction_id,cost_center_id,amount,percentage,created_by) VALUES ($1,$2,$3,$4,$5)`,[id,a.costCenterId,a.amount,(a.amount/Number(txRow.amount))*100,req.usuario.id]);
    await recordAudit({entityType:'lancamento',entityId:txRow.public_id,action:'rateado',summary:`Lançamento rateado entre ${normalized.length} centros de custo.`,data:{rateios:normalized},user:req.usuario,client:tx});
  });
  res.json({ok:true,total:sum,rateios:normalized.length});
}));

router.get('/contas', asyncRoute(async (req,res)=>{
  const { rows } = await getDb().query(`
    SELECT a.*,COALESCE(SUM(CASE WHEN m.direction='entrada' THEN m.amount ELSE -m.amount END),0) AS movimentacao,
      COUNT(m.id) FILTER (WHERE m.reconciled_transaction_id IS NULL)::int AS pendentes
    FROM bank_accounts a LEFT JOIN bank_movements m ON m.account_id=a.id
    GROUP BY a.id ORDER BY a.active DESC,a.name`);
  res.json(rows.map((r)=>({...r,opening_balance:Number(r.opening_balance),movimentacao:Number(r.movimentacao),saldo:Number(r.opening_balance)+Number(r.movimentacao)})));
}));

router.post('/contas', exigirPapel('admin','gestor'), asyncRoute(async (req,res)=>{
  const name=clean(req.body.nome,120); if(!name) throw httpError(400,'Informe o nome da conta.');
  const type=clean(req.body.tipo||'corrente',30); if(!['corrente','poupanca','caixa','cartao','outro'].includes(type)) throw httpError(400,'Tipo de conta inválido.');
  const opening=Number(req.body.saldo_inicial||0); if(!Number.isFinite(opening)) throw httpError(400,'Saldo inicial inválido.');
  const {rows}=await getDb().query(`INSERT INTO bank_accounts (name,bank_name,account_type,opening_balance,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,[name,clean(req.body.banco,120)||null,type,opening,req.usuario.id]);
  await recordAudit({entityType:'conta_bancaria',entityId:rows[0].id,action:'criada',summary:`Conta criada: ${name}`,user:req.usuario});
  res.status(201).json(rows[0]);
}));

router.get('/movimentos', asyncRoute(async (req,res)=>{
  const account=Number(req.query.conta_id)||null; const pending=String(req.query.pendente||'')==='1';
  const values=[]; const where=['1=1'];
  if(account){values.push(account);where.push(`m.account_id=$${values.length}`);} if(pending)where.push('m.reconciled_transaction_id IS NULL');
  const {rows}=await getDb().query(`SELECT m.id,m.public_id,m.account_id,a.name AS conta,m.movement_date::text AS data,m.description AS descricao,m.counterparty AS favorecido,m.amount AS valor,m.direction AS direcao,m.source,m.reconciled_transaction_id AS lancamento_id,m.reconciled_at FROM bank_movements m JOIN bank_accounts a ON a.id=m.account_id WHERE ${where.join(' AND ')} ORDER BY m.movement_date DESC,m.id DESC LIMIT 1000`,values);
  res.json(rows.map((r)=>({...r,valor:Number(r.valor)})));
}));

router.post('/extrato/importar', exigirPapel('admin','gestor'), asyncRoute(async (req,res)=>{
  const accountId=positiveId(req.body.conta_id); const source=clean(req.body.origem||'csv',30)||'csv';
  const rows=Array.isArray(req.body.movimentos)?req.body.movimentos:[]; if(!rows.length||rows.length>5000) throw httpError(400,'Envie de 1 a 5000 movimentos.');
  const account=await getDb().query('SELECT id FROM bank_accounts WHERE id=$1 AND active=TRUE',[accountId]); if(!account.rows[0]) throw httpError(404,'Conta bancária não encontrada.');
  let included=0,ignored=0;
  await getDb().transaction(async(tx)=>{
    for(const raw of rows){
      const date=clean(raw.data,10); if(!validDate(date)) throw httpError(400,'Há movimento com data inválida.');
      const description=clean(raw.descricao||raw.historico,300); if(!description) throw httpError(400,'Há movimento sem descrição.');
      const amount=asMoney(Math.abs(Number(raw.valor)),'Valor do movimento');
      const direction=raw.direcao==='entrada'||raw.direcao==='saida'?raw.direcao:(Number(raw.valor)>=0?'entrada':'saida');
      const ext=clean(raw.external_id||raw.id,180)||null; const counterparty=clean(raw.favorecido,180)||null;
      const material=[accountId,date,description.toLowerCase(),counterparty?.toLowerCase()||'',amount.toFixed(2),direction,ext||''].join('|');
      const hash=crypto.createHash('sha256').update(material).digest('hex');
      const result=await tx.query(`INSERT INTO bank_movements (public_id,account_id,external_id,movement_date,description,counterparty,amount,direction,source,source_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (account_id,source_hash) DO NOTHING RETURNING id`,[crypto.randomUUID(),accountId,ext,date,description,counterparty,amount,direction,source,hash]);
      if(result.rowCount)included++;else ignored++;
    }
    await recordAudit({entityType:'conciliacao',action:'extrato_importado',summary:`Extrato importado: ${included} novo(s), ${ignored} repetido(s).`,data:{contaId:accountId,included,ignored,source},user:req.usuario,client:tx});
  });
  res.json({ok:true,incluidos:included,ignorados:ignored});
}));

router.get('/movimentos/:id/sugestoes', asyncRoute(async(req,res)=>{
  const id=positiveId(req.params.id); const {rows:[m]}=await getDb().query('SELECT * FROM bank_movements WHERE id=$1',[id]); if(!m) throw httpError(404,'Movimento não encontrado.');
  const txType=m.direction==='entrada'?'receita':'despesa'; const {rows}=await getDb().query(`
    SELECT t.id,t.description AS descricao,t.counterparty AS favorecido,t.amount AS valor,t.transaction_date::text AS data,t.financial_status AS status_financeiro,cc.code AS centro_codigo,cc.name AS centro_nome,
      ABS(t.transaction_date-$1::date) AS distancia_dias
    FROM transactions t JOIN cost_centers cc ON cc.id=t.cost_center_id
    WHERE t.deleted_at IS NULL AND t.accounting_sign=1 AND t.type=$2 AND ABS(t.amount-$3)<=0.01 AND ABS(t.transaction_date-$1::date)<=7
    ORDER BY CASE WHEN LOWER(COALESCE(t.counterparty,''))=LOWER(COALESCE($4,'')) THEN 0 ELSE 1 END,distancia_dias,t.id DESC LIMIT 10`,[m.movement_date,txType,m.amount,m.counterparty]);
  res.json(rows.map((r)=>({...r,valor:Number(r.valor),distancia_dias:Number(r.distancia_dias)})));
}));

router.post('/movimentos/:id/conciliar', exigirPapel('admin','gestor'), asyncRoute(async(req,res)=>{
  const movementId=positiveId(req.params.id); const transactionId=positiveId(req.body.lancamento_id);
  const db=getDb(); const {rows:[m]}=await db.query('SELECT * FROM bank_movements WHERE id=$1',[movementId]); if(!m) throw httpError(404,'Movimento não encontrado.'); if(m.reconciled_transaction_id) throw httpError(409,'Este movimento já foi conciliado.');
  const {rows:[t]}=await db.query('SELECT id,public_id,type,amount,financial_status FROM transactions WHERE id=$1 AND deleted_at IS NULL AND accounting_sign=1',[transactionId]); if(!t) throw httpError(404,'Lançamento não encontrado.');
  if((m.direction==='entrada'&&t.type!=='receita')||(m.direction==='saida'&&t.type!=='despesa')) throw httpError(400,'O tipo do lançamento não corresponde ao sentido do movimento bancário.');
  if(Math.abs(Number(m.amount)-Number(t.amount))>0.01) throw httpError(400,'O valor do movimento é diferente do lançamento.');
  await db.transaction(async(tx)=>{
    await tx.query('UPDATE bank_movements SET reconciled_transaction_id=$1,reconciled_at=NOW(),reconciled_by=$2 WHERE id=$3',[transactionId,req.usuario.id,movementId]);
    if(t.financial_status!=='liquidado') await tx.query(`UPDATE transactions SET financial_status='liquidado',settlement_date=$1,revision=revision+1,updated_by=$2,updated_at=NOW() WHERE id=$3`,[m.movement_date,req.usuario.id,transactionId]);
    await recordAudit({entityType:'conciliacao',entityId:m.public_id,action:'conciliado',summary:`Movimento bancário conciliado com lançamento ${transactionId}.`,data:{transactionId,movementId},user:req.usuario,client:tx});
  });
  res.json({ok:true});
}));

router.get('/orcamentos/:id', asyncRoute(async(req,res)=>{
  const id=positiveId(req.params.id); const {rows}=await getDb().query('SELECT * FROM budget_revisions WHERE cost_center_id=$1 ORDER BY revision_number DESC',[id]); res.json(rows.map((r)=>({...r,previous_amount:Number(r.previous_amount),new_amount:Number(r.new_amount)})));
}));
router.post('/orcamentos/:id/revisar', exigirPapel('admin','gestor'), asyncRoute(async(req,res)=>{
  const id=positiveId(req.params.id); const newAmount=Number(req.body.valor); if(!Number.isFinite(newAmount)||newAmount<0) throw httpError(400,'Orçamento inválido.'); const reason=clean(req.body.motivo,1000); if(reason.length<5) throw httpError(400,'Informe o motivo da revisão.');
  const type=clean(req.body.tipo||'revisao',20); if(!['inicial','revisao','aditivo','reducao','transferencia'].includes(type)) throw httpError(400,'Tipo de revisão inválido.');
  await getDb().transaction(async(tx)=>{const {rows:[cc]}=await tx.query('SELECT monthly_budget FROM cost_centers WHERE id=$1',[id]);if(!cc)throw httpError(404,'Centro de custo não encontrado.');const {rows:[num]}=await tx.query('SELECT COALESCE(MAX(revision_number),0)+1 AS n FROM budget_revisions WHERE cost_center_id=$1',[id]);await tx.query('INSERT INTO budget_revisions (cost_center_id,revision_number,previous_amount,new_amount,change_type,reason,approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id,num.n,cc.monthly_budget,newAmount,type,reason,req.usuario.id]);await tx.query('UPDATE cost_centers SET monthly_budget=$1,updated_at=NOW() WHERE id=$2',[newAmount,id]);await recordAudit({entityType:'obra',entityId:id,action:'orcamento_revisado',summary:`Orçamento revisado para R$ ${newAmount.toFixed(2)}.`,data:{tipo:type,motivo:reason},user:req.usuario,client:tx});});
  res.json({ok:true});
}));

router.get('/fornecedores/:id/avaliacoes', asyncRoute(async(req,res)=>{const id=positiveId(req.params.id);const {rows}=await getDb().query(`SELECT r.*,u.name AS criado_por FROM supplier_ratings r LEFT JOIN users u ON u.id=r.created_by WHERE r.supplier_id=$1 ORDER BY r.created_at DESC LIMIT 50`,[id]);res.json(rows);}));
router.post('/fornecedores/:id/avaliacoes', exigirPapel('admin','gestor'), asyncRoute(async(req,res)=>{const id=positiveId(req.params.id);const score=(k)=>{const n=Number(req.body[k]);if(!Number.isInteger(n)||n<1||n>5)throw httpError(400,'Notas devem estar entre 1 e 5.');return n;};const result=await getDb().query(`INSERT INTO supplier_ratings (supplier_id,price_score,deadline_score,quality_score,documentation_score,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[id,score('preco'),score('prazo'),score('qualidade'),score('documentacao'),clean(req.body.observacao,1000)||null,req.usuario.id]);res.status(201).json(result.rows[0]);}));

router.get('/visoes', asyncRoute(async(req,res)=>{const {rows}=await getDb().query('SELECT id,name AS nome,view_type AS tipo,filters AS filtros FROM saved_views WHERE user_id=$1 ORDER BY name',[req.usuario.id]);res.json(rows);}));
router.post('/visoes', asyncRoute(async(req,res)=>{const name=clean(req.body.nome,100);if(!name)throw httpError(400,'Informe o nome da visão.');const type=clean(req.body.tipo||'lancamentos',40)||'lancamentos';const filters=req.body.filtros&&typeof req.body.filtros==='object'?req.body.filtros:{};const {rows}=await getDb().query(`INSERT INTO saved_views (user_id,name,view_type,filters) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (user_id,view_type,name) DO UPDATE SET filters=EXCLUDED.filters,updated_at=NOW() RETURNING id`,[req.usuario.id,name,type,JSON.stringify(filters)]);res.status(201).json(rows[0]);}));
router.delete('/visoes/:id', asyncRoute(async(req,res)=>{const id=positiveId(req.params.id);await getDb().query('DELETE FROM saved_views WHERE id=$1 AND user_id=$2',[id,req.usuario.id]);res.json({ok:true});}));

router.get('/backup-config', exigirPapel('admin'), asyncRoute(async(req,res)=>{const {rows}=await getDb().query("SELECT key,value FROM app_settings WHERE key IN ('auto_backup_enabled','auto_backup_hour','auto_backup_retention')");const cfg=Object.fromEntries(rows.map((r)=>[r.key,r.value]));res.json({ativo:cfg.auto_backup_enabled==='true',hora:Number(cfg.auto_backup_hour||19),retencao:Number(cfg.auto_backup_retention||30)});}));
router.put('/backup-config', exigirPapel('admin'), asyncRoute(async(req,res)=>{const enabled=Boolean(req.body.ativo);const hour=Number(req.body.hora);const retention=Number(req.body.retencao);if(!Number.isInteger(hour)||hour<0||hour>23)throw httpError(400,'Hora inválida.');if(!Number.isInteger(retention)||retention<3||retention>365)throw httpError(400,'Retenção deve ficar entre 3 e 365 backups.');for(const [key,value] of [['auto_backup_enabled',String(enabled)],['auto_backup_hour',String(hour)],['auto_backup_retention',String(retention)]])await getDb().query('INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',[key,value]);res.json({ok:true,ativo:enabled,hora:hour,retencao:retention});}));

module.exports = router;
