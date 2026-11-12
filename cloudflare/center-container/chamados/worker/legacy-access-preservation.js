// Preserve only an already granted Chamados app during the unchanged legacy user-access handler.
// Auth, role validation and the intended Centro/Orcamentos app changes remain owned by that handler.
import { configuration,explicitChamadosApp } from '../protocol.js';
const SIGNATURE='updatecloud_userssetsuite_role=?,role=?,apps=coalesce(?,apps),updated_at=?whereid=?';
const normalize=sql=>String(sql).replace(/\s+/g,'').toLowerCase();
const unavailable=()=>Response.json({ok:false,code:'CHAMADOS_ACCESS_CHECK_UNAVAILABLE',
 error:'Não foi possível conferir o acesso do Chamados. Tente salvar novamente.'},{status:503,headers:{'cache-control':'no-store'}});
async function candidate(request,env,config) {
 let body;try{const raw=await request.clone().text();if(raw.length>8192)return null;body=JSON.parse(raw);}catch{return null;}
 if(!Array.isArray(body?.apps) || typeof body.email!=='string')return null;
 const email=body.email.trim().toLowerCase();
 const row=await env.DB.prepare(`SELECT u.id,u.org_id,u.apps,g.revision FROM cloud_users u
 JOIN chamados_access_grants g ON g.user_id=u.id AND g.org_id=u.org_id
 WHERE u.org_id=? AND u.email=? AND u.active=1 AND u.deleted_at IS NULL AND g.active=1
 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>CAST(strftime('%s','now') AS INTEGER))`)
 .bind(config.organizationId,email).first();
 return row && (!body.id || body.id===row.id) && explicitChamadosApp(row.apps) ? row : null;
}
function preservingDatabase(db,before,state) {
 const replacement=`apps=CASE WHEN cloud_users.active=1 AND cloud_users.deleted_at IS NULL
 AND cloud_users.org_id=? AND cloud_users.id=?
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(cloud_users.apps) THEN cloud_users.apps ELSE '[]' END)
  WHERE value='chamados')
 AND EXISTS(SELECT 1 FROM chamados_access_grants g WHERE g.org_id=cloud_users.org_id AND g.user_id=cloud_users.id
  AND g.active=1 AND g.revoked_at IS NULL AND g.revision=?
  AND (g.expires_at IS NULL OR g.expires_at>CAST(strftime('%s','now') AS INTEGER)))
 THEN json_insert(?,'$[#]','chamados') ELSE ? END`;
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return sql=>{
   const statement=target.prepare(sql);
   if(normalize(sql)!==SIGNATURE) {
    // An unexpected future writer must not silently remove access with an unreviewed SQL shape.
    if(/^\s*UPDATE\s+cloud_users\b/i.test(sql) && /\bapps\s*=/i.test(sql)) {
     state.unsupported=true;throw new Error('Unsupported legacy user access statement');
    }
    return statement;
   }
   return new Proxy(statement,{get(original,method){
    if(method==='bind')return(...args)=>{
     if(args.length!==5 || args[4]!==before.id) {state.unsupported=true;throw new Error('Unsupported legacy user access binding');}
     if(args[2]===null || args[2]===undefined)return original.bind(...args);
     let apps;try{apps=JSON.parse(args[2]);}catch{state.unsupported=true;throw new Error('Invalid legacy app payload');}
     if(!Array.isArray(apps) || apps.some(app=>!['centro','orcamentos','chamados'].includes(app))) {
      state.unsupported=true;throw new Error('Invalid legacy app payload');
     }
     if(apps.includes('chamados'))return original.bind(...args);
     const guarded=String(sql).replace(/apps\s*=\s*COALESCE\(\?,\s*apps\)/i,replacement);
     state.guarded=true;
     return target.prepare(guarded).bind(args[0],args[1],before.org_id,before.id,before.revision,
      args[2],args[2],args[3],args[4]);
    };
    const value=Reflect.get(original,method,original);return typeof value==='function'?value.bind(original):value;
   }});
  };
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
export async function withPreservedChamadosApp(request,env,legacyFetch) {
 if(request.method!=='POST' || new URL(request.url).pathname!=='/v1/users/access')return legacyFetch(request,env);
 const config=configuration(env);if(!config || !env.DB?.prepare)return legacyFetch(request,env);
 let before;try{before=await candidate(request,env,config);}catch{return unavailable();}
 if(!before)return legacyFetch(request,env);
 const state={unsupported:false,guarded:false},delegated={...env,DB:preservingDatabase(env.DB,before,state)};
 try {
  const response=await legacyFetch(request,delegated);
  return state.unsupported?unavailable():response;
 } catch(error) {if(state.unsupported)return unavailable();throw error;}
}
