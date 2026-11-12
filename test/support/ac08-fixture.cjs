const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

async function setup(context) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ac08-'));
  Object.assign(process.env, { DATABASE_URL:'', PGLITE_DATA_DIR:path.join(temp,'db'),
    RESTORE_ROOT_DIR:path.join(temp,'restore'), JWT_SECRET:'ac08-ficticio-segredo-com-mais-de-32-caracteres',
    ADMIN_INITIAL_EMAIL:'ac08@example.invalid', ADMIN_INITIAL_PASSWORD:'ac08-ficticio-123' });
  const { initializeDatabase,closeDatabase,getDb } = require('../../db');
  const { createApp } = require('../../server');
  let server;
  context.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await closeDatabase(); fs.rmSync(temp,{ recursive:true,force:true });
  });
  await initializeDatabase();
  const db = getDb();
  server = createApp().listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token = '';
  async function request(route, method='GET', body, status=200) {
    const response = await fetch(base+route,{ method,headers:{ Authorization:`Bearer ${token}`,
      'Content-Type':'application/json' },body:body===undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    assert.equal(response.status,status,`${method} ${route}: ${text}`);
    return response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  }
  token = (await request('/auth/login','POST',{ email:'ac08@example.invalid',senha:'ac08-ficticio-123' })).token;
  const category = (await request('/categorias')).find(c => c.tipo==='ambos').id;
  async function fixture({ budget=true }={}) {
    const code = 'AC08-'+crypto.randomUUID().slice(0,12);
    const cc = (await request('/centros-custo','POST',{ codigo:code,nome:code,orcamento:0 },201)).id;
    const f = { cc,contract:crypto.randomUUID(),baseline:crypto.randomUUID(),item:crypto.randomUUID() };
    f.giveBudget = async () => {
      const imp = crypto.randomUUID();
      await db.transaction(async tx => {
        await tx.query(`INSERT INTO budget_imports(id,source_system,namespace_id,series_id,source_proposal_id,
          source_revision,payload_hash,payload) VALUES($1,'ac08',gen_random_uuid(),$2,$2,0,'fake','{}')`,[imp,code]);
        await tx.query(`INSERT INTO project_contracts(id,cost_center_id,source_system,namespace_id,series_id,number)
          VALUES($1,$2,'ac08',gen_random_uuid(),$3,$3)`,[f.contract,cc,code]);
        await tx.query(`INSERT INTO budget_baselines(id,contract_id,import_id,version,client_snapshot,work_snapshot,
          pricing,materials_cost,labor_cost,base_cost,contract_value,additions,sales_rounding_adjustment)
          VALUES($1,$2,$3,0,'{}','{}','{}',2000,0,2000,2500,0,0)`,[f.baseline,f.contract,imp]);
        await tx.query(`INSERT INTO budget_control_items(id,contract_id,kind,name,unit)
          VALUES($1,$2,'material','Material fictício','un')`,[f.item,f.contract]);
        await tx.query(`INSERT INTO budget_material_lines(id,baseline_id,control_item_id,source_line_id,position,
          code,description,category,unit,quantity,unit_cost,total_cost,allocated_sale)
          VALUES(gen_random_uuid(),$1,$2,'1',1,'AC08','Fictício','Material','un',1,2000,2000,2500)`,[f.baseline,f.item]);
        await tx.query('UPDATE project_contracts SET current_baseline_id=$1 WHERE id=$2',[f.baseline,f.contract]);
      });
    };
    if (budget) await f.giveBudget();
    return f;
  }
  const payload = (f,extra={}) => ({ tipo:'despesa',cost_center_id:f.cc,category_id:category,
    descricao:'Despesa fictícia AC08',valor:1000,data:'2026-09-01',status_financeiro:'liquidado',...extra });
  const create = (f,extra) => request('/lancamentos','POST',payload(f,extra),201);
  const comparison = (f,query='') => request(`/centros-custo/${f.cc}/orcado-realizado${query}`);
  async function edit(f,t,extra) {
    const current = await request(`/lancamentos/${t.id}`);
    return request(`/lancamentos/${t.id}`,'PUT',payload(f,{ revisao:current.revision,...extra }));
  }
  const map = (f,t) => request(`/centros-custo/${f.cc}/apropriacoes`,'POST',{
    transactionId:t.id,amount:1000,contractId:f.contract,controlItemId:f.item },201);
  const reverse = t => request(`/lancamentos/${t.id}/estornar`,'POST',{
    motivo:'Compensação fictícia AC08',data_estorno:'2026-10-01' },201);
  return { db,request,fixture,payload,create,comparison,edit,map,reverse };
}
module.exports = { setup };
