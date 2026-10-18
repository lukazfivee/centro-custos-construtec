// Central admin authority and atomic Chamados grants. All writes include an audit record.
import { parseSuiteApps } from '../protocol.js';

const ADMIN = `
WITH RECURSIVE lineage AS (
 SELECT token_hash,user_id,org_id,expires_at,parent_session_hash,0 AS depth FROM cloud_sessions WHERE token_hash=?
 UNION ALL
 SELECT p.token_hash,p.user_id,p.org_id,p.expires_at,p.parent_session_hash,c.depth+1
 FROM cloud_sessions p JOIN lineage c ON p.token_hash=c.parent_session_hash WHERE c.depth<16
), administrator AS (
 SELECT u.id,u.org_id,u.name,u.email,u.role,u.suite_role,u.apps
 FROM cloud_sessions s JOIN cloud_users u ON u.id=s.user_id AND u.org_id=s.org_id
 WHERE s.token_hash=? AND u.org_id=? AND u.active=1 AND u.deleted_at IS NULL
 AND u.role='admin' AND (u.suite_role='admin' OR u.suite_role IS NULL)
 AND NOT EXISTS (SELECT 1 FROM lineage l WHERE l.expires_at<=? OR l.user_id<>u.id OR l.org_id<>u.org_id
  OR l.depth>=16 OR (l.parent_session_hash IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM cloud_sessions p WHERE p.token_hash=l.parent_session_hash)))
)
`;

function authority(env, auth, now, tail, args=[]) {
 return env.DB.prepare(ADMIN + tail).bind(auth.hash,auth.hash,auth.orgId,now,...args);
}

export async function readAdministrator(env, tokenHash, orgId, now) {
 const auth={hash:tokenHash,orgId};
 const user=await authority(env,auth,now,'SELECT * FROM administrator').first();
 return user && parseSuiteApps(user.apps).includes('centro') ? {...auth,user} : undefined;
}

export function publicUser(row) {
 return {id:row.id,name:row.name,email:row.email,role:row.role,
  suiteRole:row.suite_role || (row.role==='admin'?'admin':row.role==='gestor'?'gestor':'tecnico'),
  apps:parseSuiteApps(row.apps),active:row.active===1};
}

export function publicGrant(row) {
 if (!row) return null;
 return {userId:row.user_id,identityType:row.identity_type,
  capabilities:JSON.parse(row.capabilities_json),scope:JSON.parse(row.scope_json),
  active:row.active===1 && !row.revoked_at,revision:row.revision,
  expiresAt:row.expires_at===null?null:new Date(row.expires_at*1000).toISOString(),
  grantedBy:row.granted_by,grantedAt:row.granted_at,revokedAt:row.revoked_at};
}

export const readTarget=(env,org,id)=>env.DB.prepare(`
 SELECT id,org_id,name,email,role,suite_role,apps,active,deleted_at,updated_at
 FROM cloud_users WHERE org_id=? AND id=? AND deleted_at IS NULL`).bind(org,id).first();
export const readGrant=(env,org,id)=>env.DB.prepare(
 'SELECT * FROM chamados_access_grants WHERE org_id=? AND user_id=?').bind(org,id).first();
export const readReplay=(env,org,actor,key)=>env.DB.prepare(`
 SELECT body_hash,response_json FROM chamados_grant_audit
 WHERE org_id=? AND actor_id=? AND request_id=?`).bind(org,actor,key).first();

export async function readHistory(env,org,id) {
 const rows=(await env.DB.prepare(`SELECT id,actor_id,actor_name,action,reason,created_at,new_json
 FROM chamados_grant_audit WHERE org_id=? AND user_id=? ORDER BY json_extract(new_json,'$.revision') DESC,created_at DESC,id DESC LIMIT 20`)
 .bind(org,id).all()).results || [];
 return rows.map(r=>({id:r.id,actorId:r.actor_id,actorName:r.actor_name,action:r.action,
  reason:r.reason,createdAt:r.created_at,revision:JSON.parse(r.new_json).revision}));
}

export async function clientOptions(env,org) {
 if (!env.CHAMADOS_DB?.prepare) return {clients:[],clientsAvailable:false};
 const rows=(await env.CHAMADOS_DB.prepare(`
 SELECT id,name FROM cc_entities WHERE organization_id=? AND type='clientes' AND active=1
 ORDER BY name,id LIMIT 1001`).bind(org).all()).results || [];
 if(rows.length>1000) return {clients:[],clientsAvailable:false};
 return {clients:rows.map(r=>({id:r.id,name:r.name})),clientsAvailable:true};
}

export async function clientsExist(env,org,ids) {
 if(!ids.length) return true;
 if(!env.CHAMADOS_DB?.prepare) return false;
 for(let offset=0;offset<ids.length;offset+=50) {
  const chunk=ids.slice(offset,offset+50);
  const rows=(await env.CHAMADOS_DB.prepare(`
   SELECT id FROM cc_entities WHERE organization_id=? AND type='clientes' AND active=1
   AND id IN (${chunk.map(()=>'?').join(',')})`).bind(org,...chunk).all()).results || [];
  if(rows.length!==chunk.length) return false;
 }
 return true;
}

function targetPredicate(target) {
 return {sql:`EXISTS(SELECT 1 FROM cloud_users t WHERE t.id=? AND t.org_id=? AND t.name=? AND t.email=?
  AND t.role=? AND t.suite_role IS ? AND t.apps IS ? AND t.active=? AND t.deleted_at IS NULL AND t.updated_at=?)`,
  args:[target.id,target.org_id,target.name,target.email,target.role,target.suite_role,target.apps,target.active,target.updated_at]};
}

function guard(env) {
 const id=crypto.randomUUID();
 return {check:env.DB.prepare('INSERT INTO chamados_write_guards(token,succeeded) VALUES(?,changes())').bind(id),
  clear:env.DB.prepare('DELETE FROM chamados_write_guards WHERE token=?').bind(id)};
}

export async function writeGrant(env,{auth,target,previous,next,requestId,bodyHash,reason,action,now}) {
 const timestamp=new Date(now*1000).toISOString();
 const revision=next.revision, expected=revision-1, org=auth.orgId;
 const current=targetPredicate(target), changed=guard(env), mirrored=guard(env);
 const apps=parseSuiteApps(target.apps);
 if(next.active && !apps.includes('chamados')) apps.push('chamados');
 const response={ok:true,user:{...publicUser(target),apps},grant:next};
 const values=[org,target.id,next.identityType,JSON.stringify(next.capabilities),JSON.stringify(next.scope),
  next.active?1:0,revision,next.expiresAt===null?null:Date.parse(next.expiresAt)/1000,
  auth.user.id,timestamp,next.revokedAt];
 const authorized=`EXISTS(SELECT 1 FROM administrator a WHERE a.id=? AND a.apps IS ? AND a.suite_role IS ?)`;
 const actor=[auth.user.id,auth.user.apps,auth.user.suite_role];
 const save=authority(env,auth,now,`
 INSERT INTO chamados_access_grants(org_id,user_id,identity_type,capabilities_json,scope_json,
 active,revision,expires_at,granted_by,granted_at,revoked_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${authorized} AND ${current.sql}
 AND ((?=0 AND NOT EXISTS(SELECT 1 FROM chamados_access_grants WHERE org_id=? AND user_id=?))
  OR EXISTS(SELECT 1 FROM chamados_access_grants WHERE org_id=? AND user_id=? AND revision=?))
 ON CONFLICT(org_id,user_id) DO UPDATE SET identity_type=excluded.identity_type,
 capabilities_json=excluded.capabilities_json,scope_json=excluded.scope_json,active=excluded.active,
 revision=excluded.revision,expires_at=excluded.expires_at,granted_by=excluded.granted_by,
 granted_at=excluded.granted_at,revoked_at=excluded.revoked_at WHERE chamados_access_grants.revision=?
 `,[...values,...actor,...current.args,expected,org,target.id,org,target.id,expected,expected]);
 const update=authority(env,auth,now,`
 UPDATE cloud_users SET apps=?,updated_at=? WHERE id=? AND org_id=? AND ${authorized} AND ${current.sql}
 `,[JSON.stringify(apps),timestamp,target.id,org,...actor,...current.args]);
 const audit=env.DB.prepare(`
 INSERT INTO chamados_grant_audit(id,org_id,user_id,actor_id,actor_name,action,reason,request_id,
 body_hash,old_json,new_json,response_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).bind(crypto.randomUUID(),org,target.id,auth.user.id,auth.user.name,action,reason,requestId,
  bodyHash,JSON.stringify(previous),JSON.stringify(next),JSON.stringify(response),timestamp);
 await env.DB.batch([save,changed.check,update,mirrored.check,audit,changed.clear,mirrored.clear]);
 return response;
}
