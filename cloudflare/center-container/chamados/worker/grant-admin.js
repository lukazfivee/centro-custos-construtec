import { configuration, record, cleanText, validateIdentity } from '../protocol.js';
import { sourceSessionHash } from './chamados-central.js';
import { hash } from './session-store.js';
import { readAdministrator,readTarget,readGrant,readReplay,readHistory,publicUser,publicGrant,
 clientOptions,clientsExist,writeGrant } from './grant-store.js';

const PATH='/v1/users/chamados-access';
const CAPS=['chamados.ler','chamados.criar','chamados.editar','chamados.executar','chamados.gerir'];
const respond=(data,status=200)=>Response.json(data,{status,headers:{
 'cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(status,code,error)=>respond({ok:false,code,error},status);
const replay=(saved,bodyHash)=>saved.body_hash===bodyHash
 ? respond({...JSON.parse(saved.response_json),replayed:true})
 : fail(409,'IDEMPOTENCY_CONFLICT','Esta tentativa já foi usada com outros dados. Recarregue o acesso.');

function parseChange(body,target,previous,org,now) {
 if(!record(body) || !['save','revoke'].includes(body.action)
  || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision<0
  || !cleanText(body.reason,500) || body.reason.length<5) return null;
 const keys=body.action==='revoke'?['action','userId','expectedRevision','reason']
  :['action','userId','expectedRevision','reason','identityType','capabilities','scope','expiresAt'];
 if(Object.keys(body).some(k=>!keys.includes(k))) return null;
 if(body.action==='revoke') return previous?{...previous,active:false}:null;
 if(target.active!==1 || !Array.isArray(body.capabilities) || !body.capabilities.includes('chamados.ler')
  || body.capabilities.some(c=>!CAPS.includes(c))) return null;
 const identity=validateIdentity({userId:target.id,organizationId:org,name:target.name,
  active:true,application:'chamados',type:body.identityType,
  suiteRole:body.identityType==='portal'?null:publicUser(target).suiteRole,
  capabilities:body.capabilities,scope:body.scope},org);
 if(!identity || (identity.scope.restrito && !identity.scope.clientes.length)) return null;
 let expiresAt=null;
 if(body.expiresAt!==null) {
  if(typeof body.expiresAt!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(body.expiresAt)) return null;
  const seconds=Math.floor(Date.parse(body.expiresAt)/1000);
  if(!Number.isSafeInteger(seconds) || seconds<=now) return null;
  expiresAt=new Date(seconds*1000).toISOString();
 }
 return {userId:target.id,identityType:identity.type,capabilities:identity.capabilities,
  scope:identity.scope,active:true,expiresAt};
}

export async function handleChamadosGrantAdmin(request,env) {
 const url=new URL(request.url);
 if(url.pathname!==PATH) return undefined;
 if(!['GET','POST'].includes(request.method)) return new Response(null,{status:405,headers:{allow:'GET, POST'}});
 const config=configuration(env),now=Math.floor(Date.now()/1000);
 if(!config || !env.DB?.prepare || !env.DB?.batch) return fail(503,'NOT_CONFIGURED','A administração do Chamados ainda não está configurada.');
 try {
  // The Orçamentos service delegation cannot manage central authorization.
  if(request.headers.get('x-construtec-identity-key')) return fail(403,'ADMIN_REQUIRED','Use uma sessão de administrador da Suíte.');
  const tokenHash=await sourceSessionHash(request,env);
  const auth=tokenHash && await readAdministrator(env,tokenHash,config.organizationId,now);
  if(!auth) return fail(403,'ADMIN_REQUIRED','Use uma sessão ativa de administrador da Suíte.');
  let body;
  if(request.method==='POST') {
   if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return fail(400,'BODY_INVALID','Envie os dados em JSON.');
   const source=await request.text();
   if(source.length>262144) return fail(413,'BODY_TOO_LARGE','A concessão excede o tamanho permitido.');
   try {body=JSON.parse(source);} catch {return fail(400,'BODY_INVALID','Os dados enviados são inválidos.');}
  }
  const id=request.method==='GET'?url.searchParams.get('userId'):body?.userId;
  if(!cleanText(id,160)) return fail(400,'USER_REQUIRED','Selecione uma conta central.');
  const target=await readTarget(env,config.organizationId,id);
  if(!target) return fail(404,'USER_NOT_FOUND','A conta central não foi encontrada.');
  const previous=publicGrant(await readGrant(env,config.organizationId,id));
  if(request.method==='GET') {
   const options=await clientOptions(env,config.organizationId);
   return respond({ok:true,user:publicUser(target),grant:previous,
    history:await readHistory(env,config.organizationId,id),capabilities:CAPS,...options});
  }
  const key=request.headers.get('idempotency-key') || '';
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))
   return fail(400,'IDEMPOTENCY_REQUIRED','Identifique a tentativa de alteração.');
  const bodyHash=await hash(JSON.stringify(body));
  const saved=await readReplay(env,config.organizationId,auth.user.id,key);
  if(saved) return replay(saved,bodyHash);
  if(!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision!==(previous?.revision || 0))
   return fail(409,'REVISION_CONFLICT','Outra pessoa alterou este acesso. Recarregue antes de salvar.');
  const value=parseChange(body,target,previous,config.organizationId,now);
  if(!value) return fail(400,'GRANT_INVALID','Confira tipo, permissões, clientes, validade e motivo. O portal permite somente leitura e criação.');
  if(body.action==='save' && !(await clientsExist(env,config.organizationId,value.scope.clientes)))
   return fail(400,'CLIENT_INVALID','Algum cliente foi desativado, não existe ou pertence a outra organização.');
  const timestamp=new Date(now*1000).toISOString();
  const next={...value,revision:body.expectedRevision+1,grantedBy:auth.user.id,
   grantedAt:timestamp,revokedAt:body.action==='revoke'?timestamp:null};
  try {
   const data=await writeGrant(env,{auth,target,previous,next,requestId:key,bodyHash,
    reason:body.reason,action:body.action,now});
   return respond(data);
  } catch(error) {
   const committed=await readReplay(env,config.organizationId,auth.user.id,key);
   if(committed) return replay(committed,bodyHash);
   if(/CHECK constraint failed|chamados_write_guards|UNIQUE constraint/.test(String(error?.message)))
    return fail(409,'REVISION_CONFLICT','O acesso ou a sessão mudou. Recarregue antes de salvar.');
   return fail(503,'WRITE_UNAVAILABLE','Não foi possível confirmar a alteração. Tente novamente com os mesmos dados.');
  }
 } catch {
  return fail(503,'CENTRAL_UNAVAILABLE','Não foi possível consultar a autorização central agora.');
 }
}
