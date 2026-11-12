'use strict';
const crypto = require('crypto');
const { getDb } = require('../db');
const { insertTransaction } = require('../lib/transactionInsert');
const { can } = require('./permissions');
const { assertObra, escopado, obrasPermitidas } = require('./obraScope');
const { isMonthClosed } = require('./financialPolicy');
const { recordAudit } = require('./audit');
const { todayIso } = require('../lib/dates');
const { httpError } = require('../lib/http');
const { checkItems } = require('../lib/whatsappImport/check');
const { sourceRows, unparsedAmountLines } = require('../lib/whatsappImport/source');
const { normalizeCenterName } = require('../lib/whatsappImport/names');
const { messageHash, lineClientId } = require('../lib/whatsappImport/identity');

async function importar(req, texto, itens) {
  if (typeof texto !== 'string' || !texto.trim() || texto.length > 20000 || !Array.isArray(itens) || itens.length > 1000) throw httpError(400, 'Texto ou itens inválidos. Limite: 20 mil caracteres.');
  if (itens.some(item => !item || typeof item !== 'object' || Array.isArray(item) || ['descricao','centro','valor_texto','fornecedor','total_bloco_texto'].some(key => item[key] != null && typeof item[key] !== 'string'))) throw httpError(400, 'Formato dos itens inválido.');
  const db = getDb(), hash = messageHash(texto), checked = checkItems(texto, itens);
  const importId = crypto.randomUUID(), date = todayIso(), mayCreate = await can(req.usuario, 'p5');
  const { rows:imports } = await db.query('INSERT INTO whatsapp_imports(public_id,user_id,text_hash,source_text) VALUES($1,$2,$3,$4) RETURNING id', [importId,req.usuario.id,hash,texto]);
  const out = { importId, lancados:[], pendencias:[], centrosCriados:[] };
  for (const item of checked) {
    if (!item.ok) { out.pendencias.push({linha:item.sourceIndex == null ? item.linha : item.sourceIndex + 1,motivo:item.motivo}); continue; }
    try {
      const result = await processItem(db, req, item, {hash,date,mayCreate,importDbId:imports[0].id});
      if (result.centerCreated) out.centrosCriados.push(result.centerCreated);
      out.lancados.push(result.transaction);
    } catch (error) {
      if (!error.publicPending) throw error;
      out.pendencias.push({linha:item.linha,motivo:error.message});
    }
  }
  for (const row of sourceRows(texto)) {
    if (!checked.some(item => item.sourceIndex === row.index)) out.pendencias.push({linha:row.index + 1,motivo:'Linha da mensagem não identificada pela IA.'});
  }
  for (const linha of unparsedAmountLines(texto)) out.pendencias.push({linha,motivo:'Valor em formato não reconhecido; confira a linha manualmente.'});
  await db.query('UPDATE whatsapp_imports SET pending_items=$1::jsonb WHERE id=$2',[JSON.stringify(out.pendencias),imports[0].id]);
  return out;
}
function pending(message) { const error = new Error(message); error.publicPending = true; return error; }
async function processItem(db, req, item, ctx) {
  const key = normalizeCenterName(item.centro);
  if (!key.chave || key.nomeExibicao.length > 140) throw pending('Nome do centro inválido.');
  const centers = (await db.query('SELECT id,code,name,active FROM cost_centers')).rows.filter(c => normalizeCenterName(c.name).chave === key.chave);
  if (centers.length > 1) throw pending('Mais de um centro corresponde ao nome.');
  let center = centers[0];
  if (center && !center.active) throw pending('Centro de custo inativo.');
  if (center) { try { await assertObra(req, center.id); } catch (error) { if (error.statusCode === 403) throw pending('Sem acesso a este centro.'); throw error; } }
  if (!center && (!ctx.mayCreate || escopado(req.usuario))) throw pending('Centro não existe; peça a admin ou gestor.');
  const categories = (await db.query("SELECT id,name FROM categories WHERE active=true AND type IN ('despesa','ambos')")).rows;
  const category = categories.find(c => Number(c.id) === Number(item.categoria_id)) || categories.find(c => c.name.toLowerCase() === 'outros');
  if (!category) throw pending('Categoria de despesa indisponível.');
  if (await isMonthClosed(ctx.date)) throw pending('Competência fechada.');
  if (item.centavos > 99999999999999) throw pending('Valor fora do limite permitido.');
  const clientId = lineClientId(ctx.hash, 'source', item.sourceIndex);
  const allowed = await obrasPermitidas(req);
  return db.transaction(async tx => {
    await tx.query('LOCK TABLE monthly_closings IN SHARE MODE');
    await tx.query('LOCK TABLE cost_centers IN SHARE ROW EXCLUSIVE MODE');
    const matching = (await tx.query('SELECT id,code,name,active FROM cost_centers')).rows.filter(c => normalizeCenterName(c.name).chave === key.chave);
    if (matching.length > 1) throw pending('Mais de um centro corresponde ao nome.');
    center = matching[0];
    if (center && allowed && !allowed.includes(Number(center.id))) throw pending('Sem acesso a este centro.');
    if (!center && (!ctx.mayCreate || escopado(req.usuario))) throw pending('Centro não existe; peça a admin ou gestor.');
    let created = null;
    const existing = (await tx.query('SELECT id,public_id,deleted_at FROM transactions WHERE created_by=$1 AND client_id=$2',[req.usuario.id,clientId])).rows[0];
    if (existing) return { transaction:{id:existing.id,public_id:existing.public_id,replayed:true,excluido:Boolean(existing.deleted_at)} };
    if ((await tx.query('SELECT 1 FROM whatsapp_import_items WHERE source_hash=$1 AND line_key=$2',[ctx.hash,String(item.sourceIndex)])).rows.length) throw pending('Linha já importada por outra pessoa.');
    if (await isMonthClosed(ctx.date, tx)) throw pending('Competência fechada.');
    const currentCategory = (await tx.query("SELECT active,type FROM categories WHERE id=$1 FOR SHARE",[category.id])).rows[0];
    if (!currentCategory || !currentCategory.active || !['despesa','ambos'].includes(currentCategory.type)) throw pending('Categoria de despesa indisponível.');
    if (center) {
      const currentCenter = (await tx.query('SELECT active FROM cost_centers WHERE id=$1 FOR SHARE',[center.id])).rows[0];
      if (!currentCenter || !currentCenter.active) throw pending('Centro de custo inativo.');
    }
    if (!center) {
      const code = `WA-${crypto.createHash('sha256').update(key.chave).digest('hex').slice(0,24)}`;
      const inserted = await tx.query('INSERT INTO cost_centers(public_id,code,name,kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id,code,name', [crypto.randomUUID(),code,key.nomeExibicao,'obra']);
      center = inserted.rows[0];
      if (!center) throw pending('Centro criado simultaneamente; tente novamente.');
      created = { id:center.id, codigo:center.code, nome:center.name };
      await recordAudit({entityType:'obra',entityId:center.id,action:'criada',summary:`Centro criado: ${center.name}`,user:req.usuario,client:tx});
    }
    const data = {type:'despesa', costCenterId:center.id, categoryId:category.id,
      description:String(item.descricao).trim().slice(0,240), counterparty:String(item.fornecedor || '').trim().slice(0,160) || null,
      amount:`${Math.floor(item.centavos / 100)}.${String(item.centavos % 100).padStart(2, '0')}`, date:ctx.date, dueDate:ctx.date, financialStatus:'pendente',
      settlementDate:null, notes:null, documentNumber:null, paymentMethod:null};
    const transaction = await insertTransaction(data, req.usuario, clientId, tx, true);
    if (!transaction) throw pending('Linha importada simultaneamente; tente novamente.');
    const link = await tx.query('INSERT INTO whatsapp_import_items(import_id,transaction_id,created_cost_center_id,line_key,source_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',[ctx.importDbId,transaction.id,created?.id || null,String(item.sourceIndex),ctx.hash]);
    if (!link.rows[0]) throw pending('Linha já importada simultaneamente.');
    Object.assign(transaction, {itemId:link.rows[0].id, descricao:item.descricao, centro:center.name, valor:item.centavos / 100});
    await recordAudit({entityType:'lancamento',entityId:transaction.public_id,action:'criado',summary:`Lançamento criado: ${item.descricao}`,data:{origem:'whatsapp',valor:item.centavos/100},user:req.usuario,client:tx});
    return { transaction,centerCreated:created };
  });
}
module.exports = { importar };
