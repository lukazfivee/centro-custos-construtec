import { explicitChamadosApp,validateIdentity } from '../protocol.js';
import { hash } from './session-store.js';
const PUBLIC=new Set(['criado','iniciar','aguardar_cliente','retomar','concluir','cancelar','reabrir','concluido_por_atividade']);
async function recipient(env,config,id,now) {
 const row=await env.DB.prepare(`SELECT u.id,u.org_id,u.name,u.email,u.role,u.suite_role,u.apps,
 g.identity_type,g.capabilities_json,g.scope_json,g.revision,g.expires_at
 FROM cloud_users u JOIN chamados_access_grants g ON g.org_id=u.org_id AND g.user_id=u.id
 WHERE u.id=? AND u.org_id=? AND u.active=1 AND u.deleted_at IS NULL AND g.active=1
 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)`).bind(id,config.organizationId,now).first();
 if(!row || !explicitChamadosApp(row.apps) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return null;
 let capabilities,scope;
 try{capabilities=JSON.parse(row.capabilities_json);scope=JSON.parse(row.scope_json);}catch{return null;}
 const identity=validateIdentity({userId:row.id,organizationId:row.org_id,name:row.name,active:true,application:'chamados',
 type:row.identity_type,suiteRole:row.identity_type==='portal'?null:row.suite_role||(row.role==='admin'?'admin':row.role==='gestor'?'gestor':'tecnico'),
 capabilities,scope},config.organizationId);
 return identity && identity.capabilities.some(c=>['chamados.ler','chamados.read'].includes(c)) ? {identity,email:row.email} : null;
}
async function technicianMatches(db,org,assigned,user) {
 if(!assigned) return false;
 if(assigned===user) return true;
 return !!await db.prepare(`SELECT id FROM cc_entities WHERE organization_id=? AND type='tecnicos'
 AND id=? AND user_id=? AND active=1`).bind(org,assigned,user).first();
}
export async function notificationAuthority(env,config,body,now,{forStatus=false}={}) {
 const org=config.organizationId,db=env.CHAMADOS_DB;
 const row=await db.prepare(`SELECT * FROM cc_notification_jobs WHERE organization_id=? AND event_key=? AND recipient_id=?`)
 .bind(org,body.eventKey,body.userId).first();
 if(!row || ['suprimido','falhou'].includes(row.status) && !forStatus) return null;
 if(row.event_key!=='cc-notify-'+await hash(org+'\0'+row.source_event_id+'\0'+body.userId)) return null;
 if(!forStatus && (row.client_id!==body.clientId || row.resource_type!==body.resource?.type
  || row.resource_id!==body.resource?.id || row.protocol!==body.resource?.protocol || row.visibility!==body.visibility
  || row.subject!==body.subject || row.text_body!==body.text)) return null;
 const event=await db.prepare(`SELECT id,resource_type,resource_id,action FROM cc_events WHERE organization_id=? AND id=?`)
 .bind(org,row.source_event_id).first();
 if(!event) return null;
 const imported=await db.prepare('SELECT target_id FROM cc_legacy_import_records WHERE organization_id=? AND target_id=? LIMIT 1')
 .bind(org,event.id).first();
 if(imported) return null;
 let linked=event.resource_type===row.resource_type && event.resource_id===row.resource_id;
 if(event.resource_type==='relatorio' && row.resource_type==='atividade')
  linked=!!await db.prepare('SELECT id FROM cc_reports WHERE organization_id=? AND id=? AND activity_id=?')
   .bind(org,event.resource_id,row.resource_id).first();
 if(!linked) return null;
 const resource=row.resource_type==='chamado'
  ? await db.prepare('SELECT id,client_id,creator_id,technician_id,protocol FROM cc_tickets WHERE organization_id=? AND id=?').bind(org,row.resource_id).first()
  : row.resource_type==='atividade'?await db.prepare(`SELECT a.id,d.client_id,a.technician_id,a.protocol FROM cc_activities a
    JOIN cc_devices d ON d.id=a.device_id AND d.organization_id=a.organization_id WHERE a.organization_id=? AND a.id=?`).bind(org,row.resource_id).first():null;
 if(!resource || resource.client_id!==row.client_id || resource.protocol!==row.protocol) return null;
 const client=await db.prepare("SELECT id FROM cc_entities WHERE organization_id=? AND type='clientes' AND active=1 AND id=?").bind(org,row.client_id).first();
 if(!client) return null;
 const who=await recipient(env,config,body.userId,now);
 if(!who) return null;
 const {identity}=who,scope=identity.scope;
 if(scope.restrito && !scope.clientes.includes(row.client_id)) return null;
 const assigned=await technicianMatches(db,org,resource.technician_id,body.userId);
 if((scope.somenteAtribuidos || identity.suiteRole==='tecnico') && !assigned) return null;
 if(identity.type==='portal') {
  if(row.resource_type!=='chamado' || row.visibility!=='publico' || resource.creator_id!==body.userId) return null;
  if(event.action==='comentado') {
   const meta=await db.prepare('SELECT visibility FROM cc_record_event_meta WHERE organization_id=? AND event_id=?').bind(org,event.id).first();
   if(meta?.visibility!=='publico') return null;
  } else if(!PUBLIC.has(event.action)) return null;
 }
 if(row.resource_type==='atividade' && row.visibility!=='interno') return null;
 return {row,who,resource};
}
