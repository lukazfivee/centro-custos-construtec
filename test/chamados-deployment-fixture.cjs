// Prepares an explicitly identified temporary deployment fixture; NEVER executes D1 or sends email.
// Caller must keep statements/credentials in memory, execute insertStatements atomically and always cleanup.
const path=require('node:path'),{pathToFileURL}=require('node:url'),{randomBytes,randomUUID}=require('node:crypto');
async function prepareDeploymentFixture({organizationId='rcconstrutec.com.br',grantedBy,clientIds=[],type='corporativa',suiteRole='gestor'}={}) {
 if(organizationId!=='rcconstrutec.com.br' || typeof grantedBy!=='string' || !grantedBy) throw new Error('Verified organization/grantor required');
 if(!['portal','corporativa'].includes(type) || !['tecnico','gestor'].includes(suiteRole)) throw new Error('Fixture type invalid');
 if(!Array.isArray(clientIds) || clientIds.some(id=>typeof id!=='string'||!id) || type==='portal'&&!clientIds.length) throw new Error('Existing client IDs required');
 const {makePasswordRecord}=await import(pathToFileURL(path.join(__dirname,'../cloudflare/center-container/centralAuth.js')).href);
 const id=randomUUID(),email='implantacao-chamados-'+id+'@example.invalid',name='Implantação Chamados — teste temporário';
 const password=randomBytes(32).toString('base64url')+'Aa9!',record=await makePasswordRecord(password);
 const now=new Date().toISOString(),expires=Math.floor(Date.now()/1000)+3600;
 const capabilities=type==='portal'?['chamados.ler','chamados.criar']:
  ['chamados.ler','chamados.criar','chamados.editar','chamados.executar','chamados.gerir'];
 const scope={restrito:clientIds.length>0,clientes:[...clientIds],somenteAtribuidos:false};
 // role is ALWAYS supervisor, apps ALWAYS Chamados only; this fixture is never central admin.
 const insertStatements=[
  {sql:`INSERT INTO cloud_users(id,org_id,name,email,password_salt,password_hash,password_iterations,role,suite_role,apps,active,tour_pending,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,'supervisor',?,'["chamados"]',1,0,?,?)`,params:[id,organizationId,name,email,record.salt,record.hash,record.iterations,suiteRole,now,now]},
  {sql:`INSERT INTO chamados_access_grants(org_id,user_id,identity_type,capabilities_json,scope_json,active,revision,expires_at,granted_by,granted_at)
 VALUES(?,?,?,?,?,1,1,?,?,?)`,params:[organizationId,id,type,JSON.stringify(capabilities),JSON.stringify(scope),expires,grantedBy,now]},
  {sql:"INSERT INTO notification_prefs(user_id,type,enabled) VALUES(?,'novo_acesso',0)",params:[id]},
 ];
 const guarded="EXISTS(SELECT 1 FROM cloud_users u WHERE u.id=? AND u.org_id=? AND u.email=? AND u.name=? AND u.role='supervisor')";
 const guard=[id,organizationId,email,name];
 const cleanupStatements=[
  ...['chamados_handoffs','cloud_sessions','push_devices','known_devices','notification_prefs','notifications'].map(table=>({
   sql:'DELETE FROM '+table+' WHERE user_id=? AND '+guarded,params:[id,...guard]})),
  {sql:"UPDATE chamados_access_grants SET active=0,revision=revision+1,revoked_at=?,expires_at=0 WHERE user_id=? AND org_id=? AND "+guarded,params:[now,id,organizationId,...guard]},
  // Soft deletion follows Central's own removal contract and retains any immutable audit entries.
  {sql:"UPDATE cloud_users SET active=0,deleted_at=?,updated_at=? WHERE id=? AND "+guarded,params:[now,now,id,...guard]},
 ];
 async function login(origin,fetcher=fetch) {
  const url=new URL(origin);
  if(url.protocol!=='https:' || url.pathname!=='/' || url.search || url.hash || url.username || url.password) throw new Error('HTTPS origin required');
  return fetcher(url.origin+'/v1/auth/login',{method:'POST',redirect:'error',
   headers:{'content-type':'application/json','x-construtec-app':'chamados'},body:JSON.stringify({email,password})});
 }
 return {id,email,name,expiresAt:expires,insertStatements,get cleanupStatements(){const stamp=new Date().toISOString();return cleanupStatements.map(q=>({...q,params:q.params.map(v=>v===now?stamp:v)}));},login,
  toJSON:()=>({id,email,name,expiresAt:expires,notice:'Fixture credentials and SQL deliberately omitted'})};
}
module.exports={prepareDeploymentFixture};
