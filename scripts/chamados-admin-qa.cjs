// Windows QA against an in-memory Central, through the real login and grant APIs. No real mail.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{adminFixture,WORKER}=require('../test/chamados-admin-fixture.cjs');
const {abrirChrome,novaAba}=require(process.env.CHAMADOS_CDP_HELPER||'C:/cc-int/scripts/conferencia/cdp.js');
const dir=path.join(__dirname,'../docs/verificacao/chamados-central-20261017'),cleanup=[];
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
(async()=>{
 const f=await adminFixture({after:fn=>cleanup.push(fn)});
 const {handleChamadosIntegration}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/integration-router.js')).href);
 const {handleChamadosNavigation}=await import(pathToFileURL(path.join(WORKER,'chamados/worker/navigation.js')).href);
 const {handleCentralAuth}=await import(pathToFileURL(path.join(WORKER,'centralAuth.js')).href);
 const server=http.createServer(async(req,res)=>{
  try{
   if(['/m/fonts/plex-400.woff2','/m/fonts/plex-600.woff2'].includes(req.url)){
    const file=path.join(__dirname,'../public',req.url);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':'font/woff2'});res.end(fs.readFileSync(file));return;}
   }
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=Buffer.concat(chunks),request=new Request('http://127.0.0.1:'+server.address().port+req.url,{
    method:req.method,headers:req.headers,...(body.length?{body}:{})});
   const response=handleChamadosNavigation(request,f.env)||await handleChamadosIntegration(request,f.env)||await handleCentralAuth(request,f.env)||new Response('',{status:404});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500);res.end('Test server error');console.error(e.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise(resolve=>server.close(resolve)));
 const chrome=await abrirChrome({porta:await freePort()});cleanup.push(()=>chrome.encerrar());
 const tab=await novaAba(chrome.base);cleanup.push(()=>tab.fechar());const errors=[];
 tab.aoEvento(e=>{if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);});
 await tab.tamanho(1440,1100);await tab.ir('http://127.0.0.1:'+server.address().port+'/chamados/acessos');
 assert.equal(await tab.esperar('document.querySelector("#login-form")'),true);
 await tab.digitar('[name=email]',f.email);await tab.digitar('[name=password]',f.password);await tab.clicar('#login-form button');
 assert.equal(await tab.esperar('!document.querySelector("#workspace").hidden'),true,'normal admin login');
 await tab.clicar('[data-user="'+f.admin.id+'"]');assert.equal(await tab.esperar('document.querySelector("#grant-form")'),true);
 await tab.digitar('[name=reason]','Concessão temporária da verificação local');await tab.clicar('#grant-form [type=submit]');
 assert.equal(await tab.esperar('document.querySelector(".badge.active") && document.querySelector(".history").textContent.includes("revisão 1")'),true,'grant save');
 fs.mkdirSync(dir,{recursive:true});await tab.print(path.join(dir,'admin-desktop.png'),{formato:'png'});
 const desktop=await tab.avaliar('({width:innerWidth,scroll:document.documentElement.scrollWidth,active:document.querySelector(".badge").textContent})');
 assert.ok(desktop.scroll<=desktop.width,'desktop horizontal overflow');
 await tab.tamanho(390,844);
 await tab.digitar('[name=identityType]','portal');
 assert.equal(await tab.avaliar('document.querySelector("[name=scope]").disabled'),true);
 assert.equal(await tab.avaliar('document.querySelector("[name=capability][value=\\"chamados.editar\\"]").disabled'),true);
 await tab.clicar('[name=client][value="client-one"]');
 await tab.digitar('[name=reason]','Escopo de portal na verificação local');await tab.clicar('#grant-form [type=submit]');
 assert.equal(await tab.esperar('document.querySelector(".history").textContent.includes("revisão 2")'),true,'portal update');
 await tab.avaliar('document.querySelector("#detail").scrollIntoView()');await tab.print(path.join(dir,'admin-mobile.png'),{formato:'png'});
 const mobile=await tab.avaliar('({width:innerWidth,scroll:document.documentElement.scrollWidth,type:document.querySelector("[name=identityType]").value})');
 assert.ok(mobile.scroll<=mobile.width,'mobile horizontal overflow');
 await tab.digitar('[name=reason]','Encerramento da verificação local');await tab.clicar('#revoke');
 assert.equal(await tab.esperar('!document.querySelector(".badge.active") && document.querySelector(".history").textContent.includes("revisão 3")'),true,'revoke');
 const row=f.env.DB.raw.prepare('SELECT active,revision FROM chamados_access_grants WHERE user_id=?').get(f.admin.id);
 assert.equal(row.active,0);assert.equal(row.revision,3);assert.deepEqual(errors,[]);
 await tab.clicar('#logout');assert.equal(await tab.esperar('!document.querySelector("#login-section").hidden'),true);
 await tab.avaliar(`window.CC={session:{user:()=>({role:'admin'})}};document.body.innerHTML='<div class="suite"><div class="pop" role="menu"><a href="/existing-desktop">Existente</a><div class="sep"></div></div></div><div id="suite-sheet"><div class="sheet"><a href="/existing-mobile">Existente</a></div></div>';const script=document.createElement('script');script.src='/chamados/suite.js';document.body.appendChild(script);`);
 assert.equal(await tab.esperar('document.querySelectorAll("[data-chamados-launch=app]").length===2'),true,'desktop/mobile navigation');
 assert.equal(await tab.avaliar('document.querySelectorAll("[data-chamados-launch=admin]").length'),2);
 assert.equal(await tab.avaliar('[...document.links].filter(a=>a.pathname.startsWith("/existing")).length'),2);
 await tab.avaliar("window.CC.session.user=()=>({role:'supervisor'});document.body.appendChild(document.createElement('span'));");
 assert.equal(await tab.esperar('document.querySelectorAll("[data-chamados-launch=admin]").length===0'),true,'admin navigation visibility');
 const report={ok:true,desktop,mobile,navigation:'desktop/mobile additive links; original links preserved; admin hint refreshed',historyRevisions:3,consoleErrors:errors,transport:'loopback / actual Central handlers / in-memory SQLite',emailSent:false};
 fs.writeFileSync(path.join(dir,'admin-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const fn of cleanup.reverse())await fn();});
