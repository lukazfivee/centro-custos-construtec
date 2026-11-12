import { configuration,record,cleanText } from '../protocol.js';
import { hash } from './session-store.js';
import { notificationAuthority } from './notification-authority.js';
import { receipt,ensureReceipt,claimReceipt,finishReceipt,markUncertain } from './notification-store.js';
const ROOT='/v1/internal/chamados/notifications/';
const output=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const failure=(code,retryable,status=503)=>output({code,retryable},status);
function same(a,b) {if(typeof a!=='string' || a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
const accepted=row=>output({status:row.status,providerId:row.provider_id});
function provider(env) {
 const key=env.EMAIL_PROVIDER_API_KEY,from=env.EMAIL_FROM;
 return typeof key==='string' && key.length>10 && typeof from==='string' && from.length<320 && !/[\r\n]/.test(from)
  ? {key,from}:null;
}
async function providerFetch(fetcher,url,options={}) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try {
  const response=await fetcher(url,{...options,signal:controller.signal,redirect:'manual'});
  if(response.status>=300 && response.status<400) {
   await response.body?.cancel().catch(()=>{});
   throw new Error('provider redirect rejected');
  }
  return response;
 } finally{clearTimeout(timer);}
}
async function statusOf(env,key,current,body,mail,fetcher,now) {
 if(!current || !current.provider_id || body.providerId!==current.provider_id) return failure('RECEIPT_NOT_FOUND',false,404);
 if(['bounced','complained','failed'].includes(current.status)) return accepted(current);
 let result;
 try {
  const response=await providerFetch(fetcher,'https://api.resend.com/emails/'+encodeURIComponent(current.provider_id),
   {headers:{authorization:'Bearer '+mail.key}});
  if(!response.ok) return output({status:current.status,providerId:current.provider_id,verification:'provider_unavailable'});
  result=await response.json();
 } catch {return output({status:current.status,providerId:current.provider_id,verification:'provider_unavailable'});}
 if(result.id!==current.provider_id) return failure('PROVIDER_RESPONSE_INVALID',true);
 // Only an explicit provider event can mark a delivery; sent/opened do not invent a delivered event.
 const next=['delivered','bounced','complained','failed'].includes(result.last_event)?result.last_event:current.status;
 if(next!==current.status) await env.DB.prepare(`UPDATE chamados_notification_receipts SET status=?,updated_at=?
 WHERE org_id=? AND event_key=? AND user_id=? AND provider_id=? AND status IN ('accepted','delivered')`)
 .bind(next,new Date(now*1000).toISOString(),...key,current.provider_id).run();
 return output({status:next,providerId:current.provider_id,verification:'provider_event'});
}
export async function handleChamadosNotifications(request,env,{fetcher=fetch,now=Math.floor(Date.now()/1000)}={}) {
 const path=new URL(request.url).pathname;
 if(![ROOT+'send',ROOT+'status'].includes(path)) return undefined;
 if(request.method!=='POST') return new Response(null,{status:405,headers:{allow:'POST'}});
 const config=configuration(env);
 if(!config || !env.DB?.prepare || !env.CHAMADOS_DB?.prepare) return failure('NOT_CONFIGURED',true);
 if(!same(request.headers.get('x-chamados-service-key'),config.serviceKey)) return failure('SERVICE_FORBIDDEN',false,403);
 const statusRequest=path===ROOT+'status';
 if(!statusRequest && env.CHAMADOS_NOTIFICATIONS_ENABLED!=='true') return failure('NOTIFICATIONS_DISABLED',true);
 const mail=provider(env);
 if(!mail) return failure('PROVIDER_NOT_CONFIGURED',false);
 let body;
 try {const raw=await request.text();if(raw.length>16384)return failure('BODY_INVALID',false,400);body=JSON.parse(raw);}
 catch{return failure('BODY_INVALID',false,400);}
 const keys=statusRequest?['organizationId','userId','eventKey','providerId']
  :['organizationId','userId','clientId','eventKey','resource','visibility','subject','text'];
 if(!record(body) || Object.keys(body).some(k=>!keys.includes(k)) || body.organizationId!==config.organizationId
  || !cleanText(body.userId,160) || !/^cc-notify-[a-f0-9]{64}$/.test(body.eventKey||''))
  return failure('BODY_INVALID',false,400);
 const key=[config.organizationId,body.eventKey,body.userId];
 try {
  const current=await receipt(env,key);
  const authority=await notificationAuthority(env,config,body,now,{forStatus:statusRequest});
  if(!authority) return failure('RECIPIENT_FORBIDDEN',false,403);
  if(statusRequest) return statusOf(env,key,current,body,mail,fetcher,now);
  if(!cleanText(body.subject,240) || typeof body.text!=='string' || body.text.length>8000
   || !record(body.resource) || Object.keys(body.resource).some(k=>!['type','id','protocol'].includes(k)))
   return failure('BODY_INVALID',false,400);
  const {row,who}=authority;
  const link=config.origin+'/#'+(row.resource_type==='chamado'?'chamados/':'atividades/')+encodeURIComponent(row.resource_id);
  const payload={from:mail.from,to:[who.email],subject:row.subject,text:row.text_body+'\n\nAcompanhar na Construtec: '+link};
  const bodyHash=await hash(JSON.stringify(payload)),stored=await ensureReceipt(env,key,bodyHash,now);
  if(stored.body_hash!==bodyHash) return failure('EVENT_CONFLICT',false,409);
  if(['accepted','delivered','bounced','complained'].includes(stored.status)) return accepted(stored);
  if(stored.status==='failed') return failure(stored.error_code||'PROVIDER_REJECTED',false,422);
  if(stored.status==='uncertain' || now-stored.first_attempt_at>=23*3600) {
   await markUncertain(env,key,now);return failure('RETRY_WINDOW_EXPIRED',false,409);
  }
  const lease=await claimReceipt(env,key,bodyHash,now);
  if(!lease) return failure('DELIVERY_IN_PROGRESS',true,409);
  try {
   const response=await providerFetch(fetcher,'https://api.resend.com/emails',{method:'POST',
    headers:{authorization:'Bearer '+mail.key,'content-type':'application/json','Idempotency-Key':body.eventKey},
    body:JSON.stringify(payload)});
   if(!response.ok) {
    const retryable=response.status>=500 || [408,409,425,429].includes(response.status);
    await finishReceipt(env,key,lease,{status:retryable?'pending':'failed',errorCode:'PROVIDER_REJECTED'},now);
    return failure('PROVIDER_REJECTED',retryable,retryable?503:422);
   }
   const result=await response.json();
   if(typeof result.id!=='string' || !/^[A-Za-z0-9_-]{1,120}$/.test(result.id)) throw new Error('invalid provider receipt');
   if(!await finishReceipt(env,key,lease,{status:'accepted',providerId:result.id},now)) return failure('RECEIPT_UNCONFIRMED',true);
   return output({status:'accepted',providerId:result.id});
  } catch {
   await finishReceipt(env,key,lease,{status:'pending',errorCode:'PROVIDER_UNCERTAIN'},now).catch(()=>{});
   return failure('PROVIDER_UNCERTAIN',true);
  }
 } catch {return failure('RELAY_UNAVAILABLE',true);}
}
