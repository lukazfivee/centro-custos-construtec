const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {adminFixture,WORKER}=require('./chamados-admin-fixture.cjs');
async function notificationFixture(t) {
 const f=await adminFixture(t),{env}=f,org=env.CHAMADOS_ORGANIZATION_ID,now=Math.floor(Date.now()/1000);
 await f.request('POST',{body:f.save()});
 env.DB.raw.exec(fs.readFileSync(path.join(WORKER,'d1-migrations/016-chamados-notification-receipts.sql'),'utf8'));
 Object.assign(env,{CHAMADOS_NOTIFICATIONS_ENABLED:'true',EMAIL_PROVIDER_API_KEY:'test-only-not-a-real-key',EMAIL_FROM:'test@example.invalid'});
 const db=env.CHAMADOS_DB.raw;
 db.exec(`ALTER TABLE cc_entities ADD COLUMN user_id TEXT;
 CREATE TABLE cc_tickets(id TEXT,organization_id TEXT,client_id TEXT,creator_id TEXT,technician_id TEXT,protocol TEXT);
 CREATE TABLE cc_activities(id TEXT,organization_id TEXT,device_id TEXT,technician_id TEXT,protocol TEXT);
 CREATE TABLE cc_devices(id TEXT,organization_id TEXT,client_id TEXT);
 CREATE TABLE cc_reports(id TEXT,organization_id TEXT,activity_id TEXT);
 CREATE TABLE cc_events(id TEXT,organization_id TEXT,resource_type TEXT,resource_id TEXT,action TEXT);
 CREATE TABLE cc_legacy_import_records(organization_id TEXT,target_id TEXT);
 CREATE TABLE cc_record_event_meta(organization_id TEXT,event_id TEXT,visibility TEXT);
 CREATE TABLE cc_notification_jobs(organization_id TEXT,event_key TEXT,recipient_id TEXT,source_event_id TEXT,client_id TEXT,
 resource_type TEXT,resource_id TEXT,protocol TEXT,visibility TEXT,subject TEXT,text_body TEXT,status TEXT);`);
 const eventKey='cc-notify-'+createHash('sha256').update(org+'\0event-one\0'+f.admin.id).digest('hex');
 const body={organizationId:org,userId:f.admin.id,clientId:'client-one',eventKey,
 resource:{type:'chamado',id:'ticket-one',protocol:'CH-00001'},visibility:'publico',subject:'Chamado atualizado',text:'Chamado CH-00001 atualizado.'};
 db.prepare('INSERT INTO cc_tickets VALUES(?,?,?,?,?,?)').run('ticket-one',org,'client-one',f.admin.id,f.admin.id,'CH-00001');
 db.prepare('INSERT INTO cc_events VALUES(?,?,?,?,?)').run('event-one',org,'chamado','ticket-one','iniciar');
 db.prepare('INSERT INTO cc_notification_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(org,eventKey,f.admin.id,'event-one','client-one','chamado','ticket-one','CH-00001','publico',body.subject,body.text,'processando');
 const {handleChamadosNotifications}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/notifications.js')).href);
 const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return Response.json({id:'receipt-one',last_event:'sent'});};
 async function send(patch={},options={}) {
  const route=options.route||'send',payload=route==='status'?{organizationId:org,userId:f.admin.id,eventKey,providerId:'receipt-one',...patch}:{...body,...patch};
  const response=await handleChamadosNotifications(new Request('https://central.test/v1/internal/chamados/notifications/'+route,
   {method:'POST',headers:{'x-chamados-service-key':env.CHAMADOS_SERVICE_KEY,...options.headers},body:JSON.stringify(payload)}),
   env,{fetcher:options.fetcher||fetcher,now:options.now??now});
  return {status:response.status,data:await response.json()};
 }
 return {...f,db,org,now,body,calls,fetcher,send,relay:handleChamadosNotifications};
}
module.exports={notificationFixture};
