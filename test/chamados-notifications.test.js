const test=require('node:test'),assert=require('node:assert/strict');
const {notificationFixture}=require('./chamados-notifications-fixture.cjs');
const {hasSqlite}=require('./chamados-admin-fixture.cjs');
if(!hasSqlite){test('Chamados: node:sqlite indisponível nesta versão do Node',{skip:true},()=>{});return;}
test('relay usa identidade central, payload persistido e recibo idempotente; nunca e-mail arbitrário',async t=>{
 const f=await notificationFixture(t),first=await f.send();
 assert.deepEqual(first,{status:200,data:{status:'accepted',providerId:'receipt-one'}});
 const sent=JSON.parse(f.calls[0].options.body);
 assert.deepEqual(sent.to,[f.admin.email]);assert.equal(sent.subject,f.body.subject);
 assert.ok(sent.text.endsWith('https://chamados.test/#chamados/ticket-one'));
 assert.equal(f.calls[0].options.headers['Idempotency-Key'],f.body.eventKey);
 assert.equal(f.calls[0].options.redirect,'manual');
 assert.deepEqual(await f.send(),first);assert.equal(f.calls.length,1);
 assert.equal((await f.send({email:'other@example.invalid'})).status,400);
 assert.equal((await f.send({subject:'Outro assunto'})).status,403);
});
test('relay exige chave privada, configuração, flag e outbox imutável correspondente',async t=>{
 const f=await notificationFixture(t);
 assert.equal((await f.send({}, {headers:{'x-chamados-service-key':'bad'}})).status,403);
 f.env.CHAMADOS_NOTIFICATIONS_ENABLED='false';assert.equal((await f.send()).data.code,'NOTIFICATIONS_DISABLED');
 f.env.CHAMADOS_NOTIFICATIONS_ENABLED='true';
 assert.equal((await f.send({clientId:'foreign'})).status,403);
 assert.equal((await f.send({resource:{...f.body.resource,id:'other'}})).status,403);
 assert.equal((await f.send({organizationId:'other'})).status,400);
 assert.equal(f.calls.length,0);
});
test('conta desativada, concessão revogada/expirada ou app removido impede envio',async t=>{
 for(const statement of ["UPDATE cloud_users SET active=0","UPDATE chamados_access_grants SET active=0",
 "UPDATE chamados_access_grants SET expires_at=1","UPDATE cloud_users SET apps='[\"centro\"]'"]) {
  const f=await notificationFixture(t);f.env.DB.raw.exec(statement);
  assert.equal((await f.send()).data.code,'RECIPIENT_FORBIDDEN');assert.equal(f.calls.length,0);
 }
});
test('cliente ativo e escopo atual são conferidos em cada tentativa',async t=>{
 const f=await notificationFixture(t);
 f.env.DB.raw.prepare('UPDATE chamados_access_grants SET scope_json=?').run(JSON.stringify({restrito:true,clientes:['other'],somenteAtribuidos:false}));
 assert.equal((await f.send()).status,403);
 f.env.DB.raw.prepare('UPDATE chamados_access_grants SET scope_json=?').run(JSON.stringify({restrito:false,clientes:[],somenteAtribuidos:false}));
 f.db.exec("UPDATE cc_entities SET active=0 WHERE id='client-one'");
 assert.equal((await f.send()).status,403);assert.equal(f.calls.length,0);
});
test('portal só recebe chamado próprio público e comentário exige metadado público',async t=>{
 const f=await notificationFixture(t);
 f.env.DB.raw.prepare("UPDATE chamados_access_grants SET identity_type='portal',capabilities_json=?,scope_json=?")
 .run(JSON.stringify(['chamados.ler','chamados.criar']),JSON.stringify({restrito:true,clientes:['client-one'],somenteAtribuidos:false}));
 f.db.exec("UPDATE cc_events SET action='comentado'");
 assert.equal((await f.send()).status,403);
 f.db.prepare('INSERT INTO cc_record_event_meta VALUES(?,?,?)').run(f.org,'event-one','interno');
 assert.equal((await f.send()).status,403);
 f.db.exec("UPDATE cc_record_event_meta SET visibility='publico'");
 assert.equal((await f.send()).status,200);
 f.db.exec("UPDATE cc_tickets SET creator_id='someone-else'");
 assert.equal((await f.send()).status,403);
});
test('portal não recebe eventos internos nem atividade',async t=>{
 const f=await notificationFixture(t);
 f.env.DB.raw.prepare("UPDATE chamados_access_grants SET identity_type='portal',capabilities_json=?,scope_json=?")
 .run(JSON.stringify(['chamados.ler']),JSON.stringify({restrito:true,clientes:['client-one'],somenteAtribuidos:false}));
 f.db.exec("UPDATE cc_events SET action='diagnostico'");
 assert.equal((await f.send()).status,403);
 f.db.exec("UPDATE cc_events SET action='concluido_por_atividade'");
 assert.equal((await f.send()).status,200);
});
test('técnico precisa manter atribuição real; vínculo legado exige user_id explícito',async t=>{
 const f=await notificationFixture(t);
 f.env.DB.raw.exec("UPDATE cloud_users SET role='gestor',suite_role='tecnico'");
 f.db.exec("UPDATE cc_tickets SET technician_id='legacy-tech'");
 assert.equal((await f.send()).status,403);
 f.db.prepare('INSERT INTO cc_entities VALUES(?,?,?,?,?,?)').run('legacy-tech',f.org,'tecnicos','Técnico',1,f.admin.id);
 assert.equal((await f.send()).status,200);
 f.db.exec("UPDATE cc_tickets SET technician_id='someone-else'");
 assert.equal((await f.send()).status,403);
});
test('eventos ausentes, de outro recurso ou importados não são reenviados',async t=>{
 for(const statement of ["DELETE FROM cc_events","UPDATE cc_events SET resource_id='other'"]) {
  const f=await notificationFixture(t);f.db.exec(statement);assert.equal((await f.send()).status,403);
 }
 const f=await notificationFixture(t);
 f.db.prepare('INSERT INTO cc_legacy_import_records VALUES(?,?)').run(f.org,'event-one');
 assert.equal((await f.send()).status,403);assert.equal(f.calls.length,0);
});
test('falha incerta pode repetir a mesma chave dentro de 23h e nunca além da janela',async t=>{
 const f=await notificationFixture(t),offline=async()=>{throw new Error('network');};
 const first=await f.send({}, {fetcher:offline});assert.equal(first.data.code,'PROVIDER_UNCERTAIN');assert.equal(first.data.retryable,true);
 assert.equal((await f.send({}, {now:f.now+23*3600})).data.code,'RETRY_WINDOW_EXPIRED');
 assert.equal(f.calls.length,0);
 assert.equal(f.env.DB.raw.prepare('SELECT status FROM chamados_notification_receipts').get().status,'uncertain');
});
test('lease bloqueia duas chamadas simultâneas antes da mesma confirmação',async t=>{
 const f=await notificationFixture(t);let release,started;
 const ready=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
 const first=f.send({}, {fetcher:async()=>{started();await gate;return Response.json({id:'receipt-one'});}});
 await ready;const second=await f.send();assert.equal(second.data.code,'DELIVERY_IN_PROGRESS');
 release();assert.equal((await first).status,200);assert.equal(f.calls.length,0);
});
test('destinatário alterado depois da primeira tentativa exige revisão e não muda a mensagem idempotente',async t=>{
 const f=await notificationFixture(t);
 await f.send({}, {fetcher:async()=>{throw new Error('network');}});
 f.env.DB.raw.exec("UPDATE cloud_users SET email='changed@example.invalid'");
 assert.equal((await f.send()).data.code,'EVENT_CONFLICT');assert.equal(f.calls.length,0);
});
test('recibo não confirmado após aceite usa mesma chave em nova tentativa',async t=>{
 const f=await notificationFixture(t);
 f.env.DB.raw.exec("CREATE TRIGGER unavailable BEFORE UPDATE OF status ON chamados_notification_receipts WHEN NEW.status='accepted' BEGIN SELECT RAISE(ABORT,'offline'); END");
 assert.equal((await f.send()).data.code,'PROVIDER_UNCERTAIN');
 f.env.DB.raw.exec('DROP TRIGGER unavailable');
 assert.equal((await f.send()).status,200);assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].options.headers['Idempotency-Key'],f.calls[1].options.headers['Idempotency-Key']);
});
test('provedor rejeita definitivamente e consultas não inventam entrega nem reenviam',async t=>{
 const f=await notificationFixture(t);
 const bad=await f.send({}, {fetcher:async()=>new Response('',{status:422})});
 assert.equal(bad.data.retryable,false);assert.equal((await f.send()).status,422);assert.equal(f.calls.length,0);
 const g=await notificationFixture(t);await g.send();
 let result=await g.send({}, {route:'status'});assert.equal(result.data.status,'accepted');
 result=await g.send({}, {route:'status',fetcher:async()=>Response.json({id:'receipt-one',last_event:'delivered'})});
 assert.equal(result.data.status,'delivered');
 result=await g.send({}, {route:'status',fetcher:async()=>new Response('',{status:403})});
 assert.equal(result.data.status,'delivered');assert.equal(result.data.verification,'provider_unavailable');
 assert.equal((await g.send({providerId:'wrong'}, {route:'status'})).status,404);
 assert.equal(g.calls.length,2);
});
test('atividade e relatório exigem relação real com dispositivo/cliente e conteúdo interno',async t=>{
 const f=await notificationFixture(t);
 f.db.prepare('INSERT INTO cc_devices VALUES(?,?,?)').run('device-one',f.org,'client-one');
 f.db.prepare('INSERT INTO cc_activities VALUES(?,?,?,?,?)').run('activity-one',f.org,'device-one',f.admin.id,'OS-00001');
 f.db.prepare('INSERT INTO cc_reports VALUES(?,?,?)').run('report-one',f.org,'activity-one');
 f.db.exec("UPDATE cc_events SET resource_type='relatorio',resource_id='report-one',action='gerado'");
 f.db.exec("UPDATE cc_notification_jobs SET resource_type='atividade',resource_id='activity-one',protocol='OS-00001',visibility='interno'");
 const payload={resource:{type:'atividade',id:'activity-one',protocol:'OS-00001'},visibility:'interno'};
 assert.equal((await f.send(payload)).status,200);
 f.db.exec("UPDATE cc_reports SET activity_id='other'");
 assert.equal((await f.send(payload)).status,403);
});

test('redirecionamento no envio bloqueia corpo enganoso e preserva repetição idempotente',async t=>{
 for(const status of [300,301,302,303,304,307,308,399]) {
  const f=await notificationFixture(t),calls=[];let reads=0;
  const response=new Response(status===304?null:JSON.stringify({id:'untrusted-receipt'}),
   {status,headers:{location:'https://untrusted.example.invalid/collect','content-type':'application/json'}});
  response.json=async()=>{reads++;return {id:'untrusted-receipt'};};
  const result=await f.send({}, {fetcher:async(url,options)=>{calls.push({url,options});return response;}});
  assert.deepEqual(result,{status:503,data:{code:'PROVIDER_UNCERTAIN',retryable:true}},String(status));
  assert.equal(calls.length,1);assert.equal(reads,0);
  assert.equal(calls[0].url,'https://api.resend.com/emails');
  assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[0].options.headers.authorization,'Bearer '+f.env.EMAIL_PROVIDER_API_KEY);
  assert.equal(calls[0].options.headers['Idempotency-Key'],f.body.eventKey);
  const pending=f.env.DB.raw.prepare('SELECT status,provider_id,error_code FROM chamados_notification_receipts').get();
  assert.equal(pending.status,'pending');assert.equal(pending.provider_id,null);assert.equal(pending.error_code,'PROVIDER_UNCERTAIN');
  assert.deepEqual(await f.send(),{status:200,data:{status:'accepted',providerId:'receipt-one'}});
  assert.equal(f.calls.length,1);assert.equal(calls.length,1);
  assert.equal(f.calls[0].options.headers['Idempotency-Key'],calls[0].options.headers['Idempotency-Key']);
  assert.equal(f.calls[0].options.body,calls[0].options.body);
 }
});
test('redirecionamento na consulta preserva recibo sem inventar entrega nem seguir Location',async t=>{
 for(const status of [300,301,302,303,304,307,308,399]) {
  const f=await notificationFixture(t),calls=[];let reads=0;
  await f.send();assert.equal(f.calls.length,1);
  const response=new Response(status===304?null:JSON.stringify({id:'receipt-one',last_event:'delivered'}),
   {status,headers:{location:'https://untrusted.example.invalid/collect','content-type':'application/json'}});
  response.json=async()=>{reads++;return {id:'receipt-one',last_event:'delivered'};};
  const result=await f.send({}, {route:'status',fetcher:async(url,options)=>{calls.push({url,options});return response;}});
  assert.deepEqual(result,{status:200,data:{status:'accepted',providerId:'receipt-one',verification:'provider_unavailable'}},String(status));
  assert.equal(calls.length,1);assert.equal(reads,0);assert.equal(f.calls.length,1);
  assert.equal(calls[0].url,'https://api.resend.com/emails/receipt-one');
  assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.method||'GET','GET');
  assert.equal(calls[0].options.headers.authorization,'Bearer '+f.env.EMAIL_PROVIDER_API_KEY);
  const receipt=f.env.DB.raw.prepare('SELECT status,provider_id FROM chamados_notification_receipts').get();
  assert.equal(receipt.status,'accepted');assert.equal(receipt.provider_id,'receipt-one');
 }
});
