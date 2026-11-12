export const receipt=(env,key)=>env.DB.prepare(`SELECT * FROM chamados_notification_receipts
 WHERE org_id=? AND event_key=? AND user_id=?`).bind(...key).first();
export async function ensureReceipt(env,key,bodyHash,now) {
 const stamp=new Date(now*1000).toISOString();
 await env.DB.prepare(`INSERT INTO chamados_notification_receipts(org_id,event_key,user_id,body_hash,status,first_attempt_at,created_at,updated_at)
 VALUES(?,?,?,?,'pending',?,?,?) ON CONFLICT(org_id,event_key,user_id) DO NOTHING`)
 .bind(...key,bodyHash,now,stamp,stamp).run();
 return receipt(env,key);
}
export async function claimReceipt(env,key,bodyHash,now) {
 const token=crypto.randomUUID(),stamp=new Date(now*1000).toISOString();
 const row=await env.DB.prepare(`UPDATE chamados_notification_receipts SET status='sending',lease_token=?,lease_until=?,
 last_attempt_at=?,attempts=attempts+1,updated_at=? WHERE org_id=? AND event_key=? AND user_id=? AND body_hash=?
 AND status IN ('pending','sending') AND (lease_until IS NULL OR lease_until<=?) AND first_attempt_at>?
 RETURNING lease_token`).bind(token,now+45,now,stamp,...key,bodyHash,now,now-23*3600).first();
 return row?.lease_token===token?token:null;
}
export async function finishReceipt(env,key,lease,{status,providerId=null,errorCode=null},now) {
 const result=await env.DB.prepare(`UPDATE chamados_notification_receipts
 SET status=?,provider_id=COALESCE(?,provider_id),error_code=?,lease_token=NULL,lease_until=NULL,updated_at=?
 WHERE org_id=? AND event_key=? AND user_id=? AND lease_token=?`)
 .bind(status,providerId,errorCode,new Date(now*1000).toISOString(),...key,lease).run();
 return result.meta?.changes===1;
}
export async function markUncertain(env,key,now) {
 await env.DB.prepare(`UPDATE chamados_notification_receipts SET status='uncertain',error_code='RETRY_WINDOW_EXPIRED',updated_at=?
 WHERE org_id=? AND event_key=? AND user_id=? AND status IN ('pending','sending') AND first_attempt_at<=?
 AND (lease_until IS NULL OR lease_until<=?)`).bind(new Date(now*1000).toISOString(),...key,now-23*3600,now).run();
}
