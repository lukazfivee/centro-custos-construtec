const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { setup } = require('./support/ac08-fixture.cjs');

test('AC-08: sincronização de lançamentos e conflitos mantém apropriações', async context => {
  const { db,request,fixture,create,comparison,map,reverse } = await setup(context);
  const { stableHash } = require('../services/smartSync');
  async function packFor(t, mutate) {
    const pack = await request('/sincronizacao-inteligente/exportar');
    pack.payload.transactions = pack.payload.transactions.filter(row => row.publicId===t.public_id);
    await mutate(pack.payload.transactions[0],pack);
    pack.packageId = crypto.randomUUID();
    pack.payloadHash = stableHash(pack.payload);
    return pack;
  }
  const importPack = pack => request('/sincronizacao-inteligente/importar','POST',{
    conteudo:JSON.stringify(pack),nomeArquivo:'ac08-ficticio.ccsync' });

  await context.test('criação recebida, reenvio, edição e exclusão propagam valores', async () => {
    const f=await fixture(),t=await create(f,{status_financeiro:'pendente'});
    let received;
    const pack=await packFor(t,row=>{
      received=crypto.randomUUID(); row.publicId=received; row.financialStatus='liquidado';
      row.settlementDate=row.transactionDate; row.amount=1000;
    });
    assert.equal((await importPack(pack)).resumo.incluidos,1);
    assert.equal((await importPack(pack)).duplicado,true);
    assert.equal((await comparison(f)).summary.realizedCost,1000);
    const saved=(await db.query('SELECT id,public_id FROM transactions WHERE public_id=$1',[received])).rows[0];
    await map(f,saved);
    const update=await packFor(saved,row=>{ row.amount=1500; row.revision++; });
    assert.equal((await importPack(update)).resumo.atualizados,1);
    assert.equal((await comparison(f)).summary.realizedMappedCost,1500);
    const remove=await packFor(saved,row=>{ row.deletedAt=new Date().toISOString(); row.revision++; });
    assert.equal((await importPack(remove)).resumo.atualizados,1);
    assert.equal((await comparison(f)).summary.realizedCost,0);
  });

  await context.test('resolver conflito recebido e rateio aplica apenas o estado aceito', async () => {
    const a=await fixture(),b=await fixture(),t=await create(a);
    const first=await packFor(t,row=>{ row.amount=1200; row.revision++; });
    await importPack(first);
    const conflict=await packFor(t,row=>{
      row.amount=1500; row.revision++; row.lastModifiedInstanceId=crypto.randomUUID();
    });
    const centerB=(await db.query('SELECT public_id FROM cost_centers WHERE id=$1',[b.cc])).rows[0].public_id;
    conflict.payload.transactions[0].allocations=[
      {costCenterPublicId:conflict.payload.transactions[0].costCenterPublicId,amount:600,note:null},
      {costCenterPublicId:centerB,amount:900,note:null}];
    conflict.payloadHash=stableHash(conflict.payload);
    assert.equal((await importPack(conflict)).resumo.conflitos,1);
    assert.equal((await comparison(a)).summary.realizedCost,1200);
    const pending=(await request('/sincronizacao-inteligente/conflitos')).find(c=>c.entity_public_id===t.public_id && c.status==='pending');
    await request(`/sincronizacao-inteligente/conflitos/${pending.id}/resolver`,'POST',{escolha:'recebido'});
    assert.deepEqual([(await comparison(a)).summary.realizedCost,(await comparison(b)).summary.realizedCost],[600,900]);
  });

  await context.test('original e estorno recebidos juntos compensam e preservam data', async () => {
    const f=await fixture(),t=await create(f); const reversal=await reverse(t);
    const pack=await request('/sincronizacao-inteligente/exportar');
    const original=pack.payload.transactions.find(r=>r.publicId===t.public_id);
    const reversed=pack.payload.transactions.find(r=>r.publicId===reversal.estorno.public_id);
    const publicId=crypto.randomUUID(); original.publicId=publicId;
    reversed.publicId=crypto.randomUUID(); reversed.reversalOf=publicId;
    pack.payload.transactions=[reversed,original]; // O importador ordena o par.
    pack.packageId=crypto.randomUUID(); pack.payloadHash=stableHash(pack.payload);
    assert.equal((await importPack(pack)).resumo.incluidos,2);
    assert.equal((await comparison(f)).summary.realizedCost,0);
    assert.equal((await comparison(f,'?cutOffDate=2026-09-30')).summary.realizedCost,2000);
  });
  await context.test('CSV legado também cria, atualiza e exclui a apropriação', async () => {
    const f=await fixture(),t=await create(f,{status_financeiro:'pendente'});
    const { exportTransactions,importTransactions }=require('../services/sync');
    const { parseCsv,csvLine }=require('../lib/csv');
    const rows=parseCsv(await exportTransactions({where:'WHERE t.id=$1',values:[t.id]}));
    const index=Object.fromEntries(rows[0].map((name,i)=>[name,i]));
    rows[1][index.id_lancamento]=crypto.randomUUID();
    rows[1][index.status_financeiro]='liquidado'; rows[1][index.data_liquidacao]='2026-09-01';
    const user=(await db.query('SELECT id,name FROM users ORDER BY id LIMIT 1')).rows[0];
    const send=()=>importTransactions({content:rows.map(csvLine).join('\r\n'),filename:'ficticio.csv',user});
    assert.equal((await send()).incluidos,1);
    assert.equal((await comparison(f)).summary.realizedCost,1000);
    rows[1][index.revisao]='2'; rows[1][index.valor]='1500,00';
    assert.equal((await send()).atualizados,1);
    assert.equal((await comparison(f)).summary.realizedCost,1500);
    rows[1][index.revisao]='3'; rows[1][index.excluido]='sim';
    assert.equal((await send()).atualizados,1);
    assert.equal((await comparison(f)).summary.realizedCost,0);
  });
});
