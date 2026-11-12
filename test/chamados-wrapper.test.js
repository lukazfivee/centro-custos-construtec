const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {hasSqlite,adminFixture,WORKER}=require('./chamados-admin-fixture.cjs'),{prepareDeploymentFixture}=require('./chamados-deployment-fixture.cjs');
if(!hasSqlite){test('Chamados: node:sqlite indisponível nesta versão do Node',{skip:true},()=>{});return;}
test('fixture de implantação autentica pela senha normal e nunca administra Central',async t=>{
 const f=await adminFixture(t),fixture=await prepareDeploymentFixture({grantedBy:f.admin.id,clientIds:['client-one']});
 await f.env.DB.batch(fixture.insertStatements.map(q=>f.env.DB.prepare(q.sql).bind(...q.params)));
 const {handleChamadosIntegration}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/integration-router.js')).href);
 const response=await fixture.login('https://central.test',(url,options)=>handleChamadosIntegration(new Request(url,options),f.env));
 assert.equal(response.status,200);const data=await response.json();assert.match(data.sessionToken,/^[A-Za-z0-9+/]{43}$/);
 assert.equal(data.user.role,'supervisor');assert.deepEqual(data.user.apps,['chamados']);assert.equal(data.user.suiteRole,'gestor');
 assert.equal((await f.request('GET',{token:data.sessionToken})).status,403);
 assert.equal(f.env.DB.raw.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=?').get(fixture.id).n,0);
 const issued=await handleChamadosIntegration(new Request('https://central.test/v1/auth/handoff',{method:'POST',
  headers:{authorization:'Bearer '+data.sessionToken,'content-type':'application/json'},body:JSON.stringify({target:'chamados'})}),f.env);
 assert.equal(issued.status,200);assert.ok((await issued.json()).code);
 f.env.DB.raw.prepare("UPDATE cloud_users SET apps='[]' WHERE id=?").run(fixture.id);
 await f.env.DB.batch(fixture.cleanupStatements.map(q=>f.env.DB.prepare(q.sql).bind(...q.params)));
 const row=f.env.DB.raw.prepare('SELECT active,deleted_at FROM cloud_users WHERE id=?').get(fixture.id);
 assert.equal(row.active,0);assert.ok(row.deleted_at);
 assert.equal(f.env.DB.raw.prepare('SELECT COUNT(*) n FROM cloud_sessions WHERE user_id=?').get(fixture.id).n,0);
 assert.equal(f.env.DB.raw.prepare('SELECT active FROM chamados_access_grants WHERE user_id=?').get(fixture.id).active,0);
 assert.equal(JSON.stringify(fixture).includes('password'),false);
});
test('wrapper não consome corpo de rotas existentes e mantém páginas protegidas',async t=>{
 const f=await adminFixture(t);
 const {handleChamadosIntegration}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/integration-router.js')).href);
 for(const [url,body] of [['/v1/auth/login','{"email":"existing@example.invalid"}'],['/v1/auth/handoff','{"target":"orcamentos"}'],['/v1/other','{"anything":1}']]) {
  const r=new Request('https://central.test'+url,{method:'POST',body});
  assert.equal(await handleChamadosIntegration(r,f.env),undefined);assert.equal(await r.text(),body);
 }
 const page=await handleChamadosIntegration(new Request('https://central.test/chamados/acessos'),f.env);
 assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
 assert.equal((await handleChamadosIntegration(new Request('https://central.test/v1/users/chamados-access'),f.env)).status,403);
});

test('navegação invalida condicionais somente no HTML habilitado, sem alterar pedido original',async()=>{
 const {prepareChamadosNavigationRequest}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/navigation.js')).href);
 for(const pathname of ['/d','/d/','/d/index.html','/m','/m/','/m/index.html']) {
  const r=new Request('https://central.test'+pathname,{headers:{'if-none-match':'old','if-modified-since':'date','x-sample':'keep'}});
  const next=prepareChamadosNavigationRequest(r,{CHAMADOS_ENABLED:'true'});
  assert.equal(next.headers.get('if-none-match'),null);assert.equal(next.headers.get('if-modified-since'),null);
  assert.equal(next.headers.get('x-sample'),'keep');assert.equal(r.headers.get('if-none-match'),'old');
  assert.equal(prepareChamadosNavigationRequest(r,{CHAMADOS_ENABLED:'false'}),r);
 }
 const asset=new Request('https://central.test/d/app.js',{headers:{'if-none-match':'old'}});
 assert.equal(prepareChamadosNavigationRequest(asset,{CHAMADOS_ENABLED:'true'}),asset);
});
