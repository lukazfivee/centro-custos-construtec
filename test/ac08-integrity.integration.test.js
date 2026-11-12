const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./support/ac08-fixture.cjs');

test('AC-08: atomicidade, escopo e idempotência das apropriações', async context => {
  const { db,request,fixture,create,comparison,map } = await setup(context);
  const allocations = require('../services/budgets/budgetAllocations');
  await context.test('reenvios concorrentes não duplicam apropriação nem reconhecimento', async () => {
    const f=await fixture(),t=await create(f);
    const [a,b]=await Promise.all([map(f,t),map(f,t)]);
    assert.equal(a.id,b.id);
    assert.equal((await comparison(f)).summary.realizedCost,1000);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM cost_recognitions WHERE allocation_id=$1 AND status='approved'",[a.id])).rows[0].n,1);
  });
  await context.test('falha depois de mudar o mapeamento faz rollback integral', async () => {
    const f=await fixture(),t=await create(f);
    const a=(await request(`/centros-custo/${f.cc}/apropriacoes`))[0];
    const failing={ transaction:fn=>db.transaction(tx=>fn({query:async (sql,params)=>{
      if (/SELECT reconcile_expense_allocations/.test(sql)) throw new Error('falha fictícia AC08');
      return tx.query(sql,params);
    }})) };
    await assert.rejects(()=>allocations.mapExistingAllocation(failing,{
      allocationId:a.id,contractId:f.contract,controlItemId:f.item }),/falha fictícia AC08/);
    assert.equal((await comparison(f)).summary.realizedCost,1000);
    assert.equal((await comparison(f)).summary.realizedUnmappedCost,1000);
  });
  await context.test('baseline, contrato, obra e valor incompatíveis são rejeitados', async () => {
    const f=await fixture(),g=await fixture(),t=await create(f);
    await request(`/centros-custo/${f.cc}/orcado-realizado?baselineId=${g.baseline}`,'GET',undefined,400);
    await request(`/centros-custo/${f.cc}/apropriacoes`,'POST',{
      transactionId:t.id,amount:1000,contractId:g.contract,controlItemId:g.item },400);
    await request(`/centros-custo/${g.cc}/apropriacoes`,'POST',{
      transactionId:t.id,amount:1000,contractId:g.contract,controlItemId:g.item },400);
    await request(`/centros-custo/${f.cc}/apropriacoes`,'POST',{
      transactionId:t.id,amount:999,contractId:f.contract,controlItemId:f.item },400);
    assert.equal((await comparison(f)).summary.realizedCost,1000);
  });
  await context.test('itens fora da baseline continuam no total e no detalhamento', async () => {
    const f=await fixture();
    const item=(await db.query(`INSERT INTO budget_control_items(id,contract_id,kind,name,unit)
      VALUES(gen_random_uuid(),$1,'material','Fora da revisão','un') RETURNING id`,[f.contract])).rows[0].id;
    await db.query(`INSERT INTO cost_recognitions(cost_center_id,contract_id,control_item_id,recognition_date,amount)
      VALUES($1,$2,$3,'2026-09-01',250)`,[f.cc,f.contract,item]);
    const c=await comparison(f);
    assert.equal(c.summary.realizedMappedCost,250);
    assert.deepEqual(c.outsideBaseline,[{controlItemId:item,realizedCost:250}]);
  });
  await context.test('legado excluído é filtrado mesmo sem reconciliação retroativa', async () => {
    const f=await fixture(),t=await create(f); await map(f,t);
    await db.query('ALTER TABLE transactions DISABLE TRIGGER expense_transaction_lifecycle');
    try { await db.query('UPDATE transactions SET deleted_at=NOW() WHERE id=$1',[t.id]); }
    finally { await db.query('ALTER TABLE transactions ENABLE TRIGGER expense_transaction_lifecycle'); }
    assert.equal((await comparison(f)).summary.realizedCost,0);
  });
  await context.test('rollback de lançamento não altera sua apropriação', async () => {
    const f=await fixture(),t=await create(f);
    await assert.rejects(()=>db.transaction(async tx=>{
      await tx.query('UPDATE transactions SET amount=1500 WHERE id=$1',[t.id]);
      throw new Error('cancelamento fictício');
    }),/cancelamento fictício/);
    assert.equal((await comparison(f)).summary.realizedCost,1000);
  });
  await context.test('falha ao criar apropriação desfaz também o lançamento HTTP', async () => {
    const f=await fixture();
    await db.query(`CREATE FUNCTION ac08_fail_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.cost_center_id=${f.cc} THEN RAISE EXCEPTION 'falha fictícia'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER ac08_failure BEFORE INSERT ON expense_allocations FOR EACH ROW EXECUTE FUNCTION ac08_fail_allocation()');
    try {
      await request('/lancamentos','POST',{
        tipo:'despesa',cost_center_id:f.cc,category_id:(await request('/categorias')).find(c=>c.tipo==='ambos').id,
        descricao:'Falha fictícia',valor:1000,data:'2026-09-01',status_financeiro:'liquidado' },500);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM transactions WHERE cost_center_id=$1',[f.cc])).rows[0].n,0);
    } finally {
      await db.query('DROP TRIGGER ac08_failure ON expense_allocations');
      await db.query('DROP FUNCTION ac08_fail_allocation()');
    }
  });
  await context.test('várias parcelas mapeadas exigem redistribuição explícita e fazem rollback', async () => {
    const f=await fixture(),t=await create(f); const a=await map(f,t);
    await db.transaction(async tx=>{
      await tx.query('UPDATE expense_allocations SET amount=500 WHERE id=$1',[a.id]);
      await tx.query(`INSERT INTO expense_allocations(transaction_id,cost_center_id,contract_id,control_item_id,amount,mapping_status)
        VALUES($1,$2,$3,$4,500,'mapped')`,[t.id,f.cc,f.contract,f.item]);
      await tx.query('SELECT reconcile_expense_allocations($1)',[t.id]);
    });
    const entry=await request(`/lancamentos/${t.id}`);
    await request(`/lancamentos/${t.id}`,'PUT',{
      tipo:'despesa',cost_center_id:f.cc,category_id:entry.category_id,descricao:'Mudar parcela fictícia',
      valor:1500,data:'2026-09-01',status_financeiro:'liquidado',revisao:entry.revision },409);
    assert.equal((await comparison(f)).summary.realizedCost,1000);
    assert.equal(Number((await db.query('SELECT amount FROM transactions WHERE id=$1',[t.id])).rows[0].amount),1000);
  });
  await context.test('horas e despesas usam o mesmo corte de período', async () => {
    const f=await fixture(); await create(f,{data:'2026-09-10'});
    await db.query(`INSERT INTO labor_measurements(contract_id,cost_center_id,period_start,period_end,team_hours,cost_amount)
      VALUES($1,$2,'2026-09-01','2026-09-10',8,800)`,[f.contract,f.cc]);
    const before=await comparison(f,'?cutOffDate=2026-09-05');
    assert.equal(before.summary.realizedCost,0); assert.equal(before.laborHours.consumed,0);
    const after=await comparison(f,'?cutOffDate=2026-09-10');
    assert.equal(after.summary.realizedCost,1000); assert.equal(after.laborHours.consumed,8);
    await request(`/centros-custo/${f.cc}/orcado-realizado?cutOffDate=invalida`,'GET',undefined,400);
    await request(`/centros-custo/${f.cc}/orcado-realizado?baselineId=invalida`,'GET',undefined,400);
  });
  await context.test('descarte e restauração de arquivo antigo preservam lançamentos excluídos', async () => {
    const f=await fixture(),t=await create(f); await map(f,t);
    await request(`/lancamentos/${t.id}`,'DELETE');
    const code=(await db.query('SELECT code FROM cost_centers WHERE id=$1',[f.cc])).rows[0].code;
    const discarded=await request(`/centros-custo/${f.cc}/descartar`,'POST',{confirmar:code});
    const payload=(await db.query('SELECT payload FROM discarded_cost_centers WHERE id=$1',[discarded.descarte])).rows[0].payload;
    for (const a of payload.expense_allocations) { delete a.active; delete a.reversal_of_allocation_id; }
    await db.query('UPDATE discarded_cost_centers SET payload=$1::jsonb WHERE id=$2',[JSON.stringify(payload),discarded.descarte]);
    await request(`/centros-custo/descartadas/${discarded.descarte}/restaurar`,'POST',{});
    assert.equal((await comparison(f)).summary.realizedCost,0);
    assert.ok((await db.query('SELECT deleted_at FROM transactions WHERE id=$1',[t.id])).rows[0].deleted_at);
  });
  await context.test('desmapear uma parcela não aumenta o valor das outras parcelas', async () => {
    const f=await fixture(),t=await create(f); const a=await map(f,t);
    await db.transaction(async tx=>{
      await tx.query('UPDATE expense_allocations SET amount=500 WHERE id=$1',[a.id]);
      await tx.query(`INSERT INTO expense_allocations(transaction_id,cost_center_id,contract_id,control_item_id,amount,mapping_status)
        VALUES($1,$2,$3,$4,500,'mapped')`,[t.id,f.cc,f.contract,f.item]);
      await tx.query('SELECT reconcile_expense_allocations($1)',[t.id]);
    });
    await request(`/centros-custo/${f.cc}/apropriacoes/${a.id}/desmapear`,'POST',{});
    const c=await comparison(f);
    assert.equal(c.summary.realizedCost,1000);
    assert.equal(c.summary.realizedMappedCost,500);
    assert.equal(c.summary.realizedUnmappedCost,500);
  });
});
