const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./support/ac08-fixture.cjs');

test('AC-08: ciclo das apropriações com HTTP e banco descartável', async context => {
  const { db,request,fixture,create,comparison,edit,map,reverse } = await setup(context);
  for (const mapped of [false,true]) {
    await context.test(`valor, data, obra e exclusão (${mapped ? 'mapeado' : 'não mapeado'})`, async () => {
      const f=await fixture(), g=await fixture(), t=await create(f);
      if (mapped) await map(f,t);
      await edit(f,t,{ valor:1500,data:'2026-09-10' });
      const c=await comparison(f);
      assert.equal(c.summary.realizedCost,1500);
      assert.equal(c.summary.balance,500);
      assert.equal(c.summary.burnRatePercent,75);
      assert.equal((await comparison(f,'?cutOffDate=2026-09-05')).summary.realizedCost,0);
      await edit(g,t,{ valor:1500,data:'2026-09-10' });
      assert.equal((await comparison(f)).summary.realizedCost,0);
      assert.equal((await comparison(g)).summary.realizedCost,1500);
      assert.equal((await request(`/centros-custo/${f.cc}/impedimentos`)).rateios,0);
      await request(`/lancamentos/${t.id}`,'DELETE');
      assert.equal((await comparison(g)).summary.realizedCost,0);
      assert.equal((await request(`/centros-custo/${g.cc}/apropriacoes`)).length,0);
    });
    await context.test(`estorno mantém o original antes do corte (${mapped})`, async () => {
      const f=await fixture(), t=await create(f);
      if (mapped) await map(f,t);
      await reverse(t);
      assert.equal((await comparison(f,'?cutOffDate=2026-09-30')).summary.realizedCost,1000);
      assert.equal((await comparison(f,'?cutOffDate=2026-10-01')).summary.realizedCost,0);
      assert.equal((await comparison(f)).summary.realizedCost,0);
      const entries=(await db.query('SELECT accounting_sign,deleted_at FROM transactions WHERE id=$1',[t.id])).rows;
      assert.equal(entries[0].accounting_sign,1);
      assert.equal(entries[0].deleted_at,null);
      const csv=await request(`/centros-custo/${f.cc}/orcado-realizado/csv`);
      assert.match(csv,/Realizado Líquido;0,00/);
    });
    await context.test(`liquidação em massa e retorno a pendente (${mapped})`, async () => {
      const f=await fixture(), t=await create(f,{ status_financeiro:'pendente' });
      assert.equal((await comparison(f)).summary.realizedCost,0);
      await request('/produtividade/acoes-em-massa','POST',{ ids:[t.id],acao:'liquidar' });
      if (mapped) await map(f,t);
      assert.equal((await comparison(f)).summary.realizedCost,1000);
      await request('/produtividade/acoes-em-massa','POST',{ ids:[t.id],acao:'pendente' });
      assert.equal((await comparison(f)).summary.realizedCost,0);
      await edit(f,t,{});
      const c=await comparison(f);
      assert.equal(c.summary.realizedCost,1000);
      assert.equal(c.summary.realizedMappedCost,mapped ? 1000 : 0);
      await edit(f,t,{ tipo:'receita' });
      assert.equal((await comparison(f)).summary.realizedCost,0);
    });
  }
  await context.test('rateio em centavos e remoção de parcelas não duplicam o total', async () => {
    const a=await fixture(),b=await fixture(),c=await fixture(),t=await create(a);
    await map(a,t);
    await request(`/produtividade/rateio/${t.id}`,'PUT',{ rateios:[
      {cost_center_id:a.cc,valor:333.33},{cost_center_id:b.cc,valor:333.33},{cost_center_id:c.cc,valor:333.34}] });
    assert.deepEqual(await Promise.all([a,b,c].map(async f=>(await comparison(f)).summary.realizedCost)),[333.33,333.33,333.34]);
    const { getPortfolioSummary }=require('../services/budgets/budgetPortfolio');
    const portfolio=await getPortfolioSummary(db);
    assert.deepEqual([a,b,c].map(f=>portfolio.porObra.find(o=>o.id===f.cc).realizedCost),[333.33,333.33,333.34]);
    const { getCostCenterCurveS }=require('../services/budgets/budgetCurveS');
    assert.equal((await getCostCenterCurveS(db,b.cc)).evm.ac,333.33);
    await request(`/produtividade/rateio/${t.id}`,'PUT',{ rateios:[] });
    assert.deepEqual(await Promise.all([a,b,c].map(async f=>(await comparison(f)).summary.realizedCost)),[1000,0,0]);
  });
  await context.test('orçamento recebido após despesa existente cria apropriação', async () => {
    const f=await fixture({budget:false}); await create(f); await f.giveBudget();
    assert.equal((await comparison(f)).summary.realizedCost,1000);
  });
  await context.test('mapear depois de estornar compensa ambos os lados e desmapear preserva total', async () => {
    const f=await fixture(),t=await create(f); await reverse(t); const a=await map(f,t);
    assert.equal((await comparison(f)).summary.realizedMappedCost,0);
    assert.equal((await comparison(f,'?cutOffDate=2026-09-30')).summary.realizedMappedCost,1000);
    await request(`/centros-custo/${f.cc}/apropriacoes/${a.id}/desmapear`,'POST',{});
    assert.equal((await comparison(f)).summary.realizedCost,0);
    assert.equal((await comparison(f)).summary.realizedMappedCost,0);
  });
});
