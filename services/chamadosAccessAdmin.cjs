// The Centro forwards the current user's central session; no service can grant access on its own.
const ORIGIN = (value) => {
 try { const u=new URL(value); return u.protocol==='https:' && u.origin===value && u.pathname==='/'
  && !u.username && !u.password && !u.search && !u.hash ? value : null; } catch { return null; }
};
function unavailable(status=503,message='Não foi possível consultar o acesso central do Chamados.') {
 return Object.assign(new Error(message),{status,statusCode:status});
}
async function requestGrant({token,centralOrigin,method='GET',userId,body,idempotencyKey,
 environment=process.env,fetcher=fetch}) {
 const origin=ORIGIN(centralOrigin);
 if(environment.CHAMADOS_ENABLED!=='true' || !origin) throw unavailable();
 if(typeof token!=='string') throw unavailable(403,'Entre com a conta corporativa de administrador.');
 const headers={'content-type':'application/json',authorization:'Bearer '+token};
 if(/^hash:[a-f0-9]{64}$/.test(token)) {
  const key=String(environment.SYNC_SHARED_KEY||'').replace(/^\uFEFF/,'').trim();
  if(key.length<32) throw unavailable();
  headers['x-sync-key']=key;
 } else if(!/^[A-Za-z0-9+/_-]{43}$/.test(token)) throw unavailable(403,'Entre novamente com a conta corporativa.');
 if(method==='POST') headers['idempotency-key']=String(idempotencyKey||'');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
 try {
  const url=origin+'/v1/users/chamados-access'+(method==='GET'?'?userId='+encodeURIComponent(userId):'');
  const response=await fetcher(new Request(url,{method,headers,signal:controller.signal,redirect:'error',
   ...(method==='POST'?{body:JSON.stringify({...body,userId})}:{})}));
  const text=await response.text();
  if(text.length>1024*1024) throw unavailable();
  const data=JSON.parse(text);
  if(!response.ok || data.ok!==true) {
   const status=[400,401,403,404,409,413].includes(response.status)?response.status:503;
   throw unavailable(status,data.error || 'Não foi possível confirmar a alteração do acesso.');
  }
  if(data.user?.id!==userId) throw unavailable();
  return data;
 } catch(error) { throw error?.statusCode?error:unavailable(); }
 finally {clearTimeout(timer);}
}
function registerRoutes(router,{getDb,positiveId,asyncRoute,httpError,cloudAuth,mirrorCloudUser}) {
 const targetFor=async(req)=>{
  if(!req.usuario.cloud_managed || !req.usuario.cloud_session_token)
   throw httpError(403,'Entre com a conta corporativa de administrador.');
  const id=positiveId(req.params.id,'Usuário');
  const target=(await getDb().query(`SELECT id,cloud_managed,cloud_user_id FROM users
   WHERE id=$1 AND deleted_at IS NULL`,[id])).rows[0];
  if(!target) throw httpError(404,'Usuário não encontrado.');
  if(!target.cloud_managed || !target.cloud_user_id)
   throw httpError(409,'Esta conta ainda não está vinculada ao diretório central.');
  return target;
 };
 router.get('/:id/chamados',asyncRoute(async(req,res)=>{
  const target=await targetFor(req);
  const data=await requestGrant({token:req.usuario.cloud_session_token,centralOrigin:cloudAuth.apiUrl(),userId:target.cloud_user_id});
  res.set('Cache-Control','no-store').json(data);
 }));
 router.put('/:id/chamados',asyncRoute(async(req,res)=>{
  const target=await targetFor(req);
  const data=await requestGrant({token:req.usuario.cloud_session_token,centralOrigin:cloudAuth.apiUrl(),
   userId:target.cloud_user_id,method:'POST',body:req.body,idempotencyKey:req.get('Idempotency-Key')});
  try {await mirrorCloudUser(getDb(),data.user);} catch {console.warn('chamados_user_mirror_pending');}
  res.set('Cache-Control','no-store').json(data);
 }));
}
module.exports={requestGrant,registerRoutes};
