const test=require('node:test'),assert=require('node:assert/strict');
const {adminFixture}=require('./chamados-admin-fixture.cjs');
test('admin central legado concede a si próprio sem inventar papel ou alterar apps anteriores',async t=>{
 const f=await adminFixture(t),body=f.save(),key=crypto.randomUUID();
 assert.equal((await f.request('GET')).data.grant,null);
 const r=await f.request('POST',{body,key});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.grant.revision,1);assert.equal(r.data.user.suiteRole,'admin');
 assert.deepEqual(r.data.user.apps,['centro','orcamentos','chamados']);
 assert.equal(f.env.DB.raw.prepare('SELECT suite_role FROM cloud_users WHERE id=?').get(f.admin.id).suite_role,null);
 const again=await f.request('POST',{body,key});assert.equal(again.data.replayed,true);
 assert.equal(f.env.DB.raw.prepare('SELECT COUNT(*) n FROM chamados_grant_audit').get().n,1);
 assert.equal((await f.request('POST',{body:{...body,reason:'Outro motivo'},key})).status,409);
 const access=await f.central.getChamadosAccess(new Request('https://central.test/v1/auth/chamados/access',{headers:{authorization:'Bearer '+f.token}}),f.env);
 assert.equal(access.status,200);
});
test('histórico é imutável e contém ator, motivo e revisão',async t=>{
 const f=await adminFixture(t);await f.request('POST',{body:f.save()});
 const r=await f.request('GET');assert.equal(r.data.history[0].actorId,f.admin.id);
 assert.equal(r.data.history[0].reason,'Acesso para operação');assert.equal(r.data.history[0].revision,1);
 assert.throws(()=>f.env.DB.raw.exec("DELETE FROM chamados_grant_audit"),/immutable/);
 assert.throws(()=>f.env.DB.raw.exec("UPDATE chamados_grant_audit SET reason='alterado'"),/immutable/);
});
test('sem sessão, sessão não admin e delegação de serviço não podem conceder',async t=>{
 const f=await adminFixture(t);
 assert.equal((await f.request('POST',{body:f.save(),token:null})).status,403);
 assert.equal((await f.request('POST',{body:f.save(),headers:{'x-construtec-identity-key':'service'}})).status,403);
 f.env.DB.raw.exec("UPDATE cloud_users SET role='gestor',suite_role='gestor'");
 assert.equal((await f.request('POST',{body:f.save()})).status,403);
});
test('alteração concorrente usa revisão e não sobrescreve acesso de outra aba',async t=>{
 const f=await adminFixture(t);assert.equal((await f.request('POST',{body:f.save()})).status,200);
 assert.equal((await f.request('POST',{body:f.save({capabilities:['chamados.ler']})})).status,409);
 assert.equal((await f.request('POST',{body:f.save({expectedRevision:1,capabilities:['chamados.ler']})})).data.grant.revision,2);
});
test('portal exige cliente real ativo e apenas capacidades de leitura/criação',async t=>{
 const f=await adminFixture(t);
 const portal={identityType:'portal',capabilities:['chamados.ler','chamados.criar'],scope:{restrito:true,clientes:['client-one'],somenteAtribuidos:false}};
 for(const scope of [{restrito:false,clientes:[],somenteAtribuidos:false},
  {restrito:true,clientes:[],somenteAtribuidos:false},{restrito:true,clientes:['foreign'],somenteAtribuidos:false},
  {restrito:true,clientes:['inactive'],somenteAtribuidos:false},{restrito:true,clientes:['missing'],somenteAtribuidos:false}])
  assert.equal((await f.request('POST',{body:f.save({...portal,scope})})).status,400);
 assert.equal((await f.request('POST',{body:f.save({...portal,capabilities:['chamados.ler','chamados.editar']})})).status,400);
 const r=await f.request('POST',{body:f.save(portal)});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.grant.identityType,'portal');
 const read=await f.request('GET');assert.deepEqual(read.data.clients,[{id:'client-one',name:'Hospital Um'}]);
});
test('campos extras, capacidades duplicadas e validade expirada são recusados',async t=>{
 const f=await adminFixture(t);
 for(const patch of [{extra:true},{capabilities:['chamados.ler','chamados.ler']},{expiresAt:'2000-01-01T00:00:00Z'},{expiresAt:'amanhã'},{reason:'x'}])
 assert.equal((await f.request('POST',{body:f.save(patch)})).status,400);
});
test('falha de auditoria desfaz grant e alteração de apps na mesma transação',async t=>{
 const f=await adminFixture(t);
 f.env.DB.raw.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON chamados_grant_audit BEGIN SELECT RAISE(ABORT,'audit_unavailable'); END");
 assert.equal((await f.request('POST',{body:f.save()})).status,503);
 assert.equal(f.env.DB.raw.prepare('SELECT COUNT(*) n FROM chamados_access_grants').get().n,0);
 assert.equal(f.env.DB.raw.prepare('SELECT apps FROM cloud_users WHERE id=?').get(f.admin.id).apps,null);
});
test('perder papel administrativo entre leitura e escrita bloqueia a transação',async t=>{
 const f=await adminFixture(t),batch=f.env.DB.batch.bind(f.env.DB);let changed=false;
 f.env.DB.batch=async list=>{if(!changed){changed=true;f.env.DB.raw.exec("UPDATE cloud_users SET role='gestor',suite_role='gestor'");}return batch(list);};
 assert.equal((await f.request('POST',{body:f.save()})).status,409);
 assert.equal(f.env.DB.raw.prepare('SELECT COUNT(*) n FROM chamados_access_grants').get().n,0);
});
test('revogação preserva histórico e invalida entrada já emitida',async t=>{
 const f=await adminFixture(t);await f.request('POST',{body:f.save()});
 const issued=await f.central.issueChamadosHandoff(new Request('https://central.test/v1/auth/handoff',{headers:{authorization:'Bearer '+f.token}}),f.env,{target:'chamados'});
 const code=(await issued.json()).code;assert.ok(code);
 const revoke=await f.request('POST',{body:{action:'revoke',userId:f.admin.id,expectedRevision:1,reason:'Encerramento de acesso'}});
 assert.equal(revoke.status,200);assert.equal(revoke.data.grant.active,false);
 assert.equal((await f.central.consumeChamadosHandoff(f.env,{application:'chamados',origin:f.env.CHAMADOS_PUBLIC_ORIGIN,code,serviceKey:f.env.CHAMADOS_SERVICE_KEY})).invalid,true);
 assert.equal((await f.request('GET')).data.history.length,2);
});
test('ponte por hash só é permitida com chave de origem correta',async t=>{
 const f=await adminFixture(t),hash=require('node:crypto').createHash('sha256').update(f.token).digest('hex');
 assert.equal((await f.request('GET',{token:'hash:'+hash})).status,403);
 assert.equal((await f.request('GET',{token:'hash:'+hash,headers:{'x-sync-key':f.env.SYNC_SHARED_KEY}})).status,200);
});
test('cadeia administrativa com pai expirado ou ausente é recusada',async t=>{
 const f=await adminFixture(t),raw=f.env.DB.raw,crypto=require('node:crypto');
 const child='z'.repeat(43),hash=crypto.createHash('sha256').update(child).digest('hex');
 const parent=crypto.createHash('sha256').update(f.token).digest('hex'),now=Math.floor(Date.now()/1000);
 raw.prepare(`INSERT INTO cloud_sessions(token_hash,user_id,org_id,created_at,expires_at,last_seen_at,parent_session_hash)
 VALUES(?,?,?,?,?,?,?)`).run(hash,f.admin.id,'rcconstrutec.com.br',new Date().toISOString(),now+3600,new Date().toISOString(),parent);
 assert.equal((await f.request('GET',{token:child})).status,200);
 raw.prepare('UPDATE cloud_sessions SET expires_at=? WHERE token_hash=?').run(now-1,parent);
 assert.equal((await f.request('GET',{token:child})).status,403);
 raw.prepare('DELETE FROM cloud_sessions WHERE token_hash=?').run(parent);
 assert.equal((await f.request('GET',{token:child})).status,403);
});
