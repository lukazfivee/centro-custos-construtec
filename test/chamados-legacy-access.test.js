const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {hasSqlite,adminFixture,WORKER}=require('./chamados-admin-fixture.cjs');
if(!hasSqlite){test('Chamados: node:sqlite indisponível nesta versão do Node',{skip:true},()=>{});return;}
async function fixture(t,{grant=true,explicit=true}={}) {
 const f=await adminFixture(t);
 const made=await f.call('POST','/v1/users',{token:f.token,body:{name:'Target',email:'target@rcconstrutec.com.br',
 password:'OnlyLocalTest9!',suiteRole:'tecnico',apps:['centro','orcamentos']}});
 assert.equal(made.status,201);const target=made.data.user;
 if(grant)assert.equal((await f.request('POST',{body:f.save({userId:target.id})})).status,200);
 if(!explicit)f.env.DB.raw.prepare("UPDATE cloud_users SET apps='[\"centro\",\"orcamentos\"]' WHERE id=?").run(target.id);
 const {withPreservedChamadosApp}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/legacy-access-preservation.js')).href);
 const {handleCentralAuth}=await import(pathToFileURL(path.join(WORKER,'centralAuth.js')).href);
 const read=()=>f.env.DB.raw.prepare('SELECT apps,role,suite_role,active FROM cloud_users WHERE id=?').get(target.id);
 async function edit({apps=['orcamentos'],token=f.token,body={},headers={},beforeWrite,delegate}={}) {
  const request=new Request('https://central.test/v1/users/access',{method:'POST',
   headers:{'content-type':'application/json','cf-connecting-ip':'203.0.113.9',...(token?{authorization:'Bearer '+token}:{}),...headers},
   body:JSON.stringify({id:target.id,email:target.email,suiteRole:'financeiro',apps,...body})});
  let invoked=false;const env={...f.env};
  if(beforeWrite){const db=f.env.DB;env.DB=new Proxy(db,{get(obj,key){
   if(key==='prepare')return sql=>{const stmt=obj.prepare(sql);if(!/UPDATE cloud_users SET suite_role/i.test(sql))return stmt;
    return new Proxy(stmt,{get(s,k){if(k==='bind')return(...args)=>{const bound=s.bind(...args);const run=bound.run.bind(bound);
     bound.run=async()=>{if(!invoked){invoked=true;await beforeWrite();}return run();};return bound;};return Reflect.get(s,k);}});};
   const v=Reflect.get(obj,key,obj);return typeof v==='function'?v.bind(obj):v;
  }});}
  const response=await withPreservedChamadosApp(request,env,delegate||handleCentralAuth);
  return {status:response.status,data:await response.json()};
 }
 return {...f,target,read,edit,preserve:withPreservedChamadosApp};
}
test('edição legada preserva Chamados atomicamente e mantém apps/papel pretendidos pelo handler',async t=>{
 const f=await fixture(t),before=f.env.DB.raw.prepare('SELECT * FROM chamados_access_grants WHERE user_id=?').get(f.target.id);
 const r=await f.edit();assert.equal(r.status,200,JSON.stringify(r.data));
 assert.deepEqual(JSON.parse(f.read().apps),['orcamentos','chamados']);assert.equal(f.read().suite_role,'financeiro');assert.equal(f.read().role,'supervisor');
 assert.deepEqual(f.env.DB.raw.prepare('SELECT * FROM chamados_access_grants WHERE user_id=?').get(f.target.id),before);
});
test('sem grant ou sem app explícito anterior não recebe acesso novo',async t=>{
 for(const options of [{grant:false},{explicit:false}]){const f=await fixture(t,options);assert.equal((await f.edit()).status,200);assert.deepEqual(JSON.parse(f.read().apps),['orcamentos']);}
});
test('handler original mantém decisão de autenticação e nega serviço delegado',async t=>{
 const f=await fixture(t),initial=f.read().apps;
 assert.equal((await f.edit({token:null})).status,401);
 f.env.CONSTRUTEC_IDENTITY_KEY='s'.repeat(40);
 assert.equal((await f.edit({headers:{'x-construtec-identity-key':f.env.CONSTRUTEC_IDENTITY_KEY}})).status,403);
 assert.equal(f.read().apps,initial);
});
test('revogação entre leitura e escrita impede preservação',async t=>{
 const f=await fixture(t);
 assert.equal((await f.edit({beforeWrite:()=>f.env.DB.raw.prepare('UPDATE chamados_access_grants SET active=0,revision=revision+1 WHERE user_id=?').run(f.target.id)})).status,200);
 assert.deepEqual(JSON.parse(f.read().apps),['orcamentos']);
});
test('revisão diferente, expiração ou usuário desativado bloqueia preservação concorrente',async t=>{
 for(const sql of ["UPDATE chamados_access_grants SET revision=revision+1","UPDATE chamados_access_grants SET expires_at=1","UPDATE cloud_users SET active=0 WHERE email='target@rcconstrutec.com.br'"]) {
  const f=await fixture(t);assert.equal((await f.edit({beforeWrite:()=>f.env.DB.raw.exec(sql)})).status,200);
  assert.deepEqual(JSON.parse(f.read().apps),['orcamentos']);
 }
});
test('remoção concorrente do app não é desfeita pela atualização de papel',async t=>{
 const f=await fixture(t);
 await f.edit({beforeWrite:()=>f.env.DB.raw.prepare("UPDATE cloud_users SET apps='[\"centro\"]' WHERE id=?").run(f.target.id)});
 assert.deepEqual(JSON.parse(f.read().apps),['orcamentos']);
});
test('duas edições concorrentes preservam o app em ambas as ordens de escrita',async t=>{
 for(const firstApp of ['centro','orcamentos']) {
  const f=await fixture(t),states=[],lastApp=firstApp==='centro'?'orcamentos':'centro';
  const db=f.env.DB,prepare=db.prepare;let releaseFirst;
  const firstFinished=new Promise(resolve=>releaseFirst=resolve);
  db.prepare=sql=>{const stmt=prepare(sql);if(!/UPDATE cloud_users SET suite_role/i.test(sql))return stmt;
   const bind=stmt.bind.bind(stmt);stmt.bind=(...args)=>{bind(...args);const run=stmt.run.bind(stmt);stmt.run=async()=>{const r=await run();states.push(JSON.parse(f.read().apps));return r;};return stmt;};return stmt;};
  // Keep invocation order fixed while forcing each possible commit order without timers.
  const requests=['orcamentos','centro'].map(app=>{
   const request=f.edit({apps:[app],beforeWrite:app===firstApp?undefined:()=>firstFinished});
   return app===firstApp?request.finally(releaseFirst):request;
  });
  const result=await Promise.all(requests);
  assert.ok(result.every(r=>r.status===200));assert.equal(states.length,2);
  assert.deepEqual(states,[[firstApp,'chamados'],[lastApp,'chamados']]);
  assert.deepEqual(JSON.parse(f.read().apps),[lastApp,'chamados']);
 }
});
test('conta inativa, id desatualizado ou pedido sem apps mantém contrato original',async t=>{
 const f=await fixture(t);
 assert.equal((await f.edit({body:{id:'another'}})).status,404);
 assert.equal((await f.edit({body:{apps:undefined}})).status,200);assert.ok(JSON.parse(f.read().apps).includes('chamados'));
 f.env.DB.raw.prepare('UPDATE cloud_users SET active=0 WHERE id=?').run(f.target.id);
 assert.equal((await f.edit()).status,200);assert.deepEqual(JSON.parse(f.read().apps),['orcamentos']);
});
test('mudança inesperada na SQL falha antes de alterar apps, não ignora proteção',async t=>{
 const f=await fixture(t),before=f.read().apps;
 const result=await f.edit({delegate:async(_r,env)=>{
  await env.DB.prepare('UPDATE cloud_users SET apps=? WHERE id=?').bind('[]',f.target.id).run();return Response.json({ok:true});
 }});
 assert.equal(result.status,503);assert.equal(f.read().apps,before);
});
test('outros endpoints e flag desligada delegam sem tocar no corpo ou no D1',async()=>{
 const {withPreservedChamadosApp}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/legacy-access-preservation.js')).href);
 const r=new Request('https://central.test/v1/users/access',{method:'POST',body:'{}'}),env={CHAMADOS_ENABLED:'false'};
 const result=await withPreservedChamadosApp(r,env,async(request,actual)=>{assert.equal(actual,env);assert.equal(await request.text(),'{}');return new Response('original');});
 assert.equal(await result.text(),'original');
});
