// Real isolated Edge QA for public app choice; no credentials, database or mail access.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),out=path.join(root,'docs/verificacao/suite-entry-20261017');
process.env.CHROME_PATH=process.env.CHROME_PATH||[
 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(p=>fs.existsSync(p));
const {novaAba,fecharAba}=require(process.env.CHAMADOS_CDP_HELPER||'C:/cc-int/scripts/conferencia/cdp.js');
const {spawn,execFileSync}=require('node:child_process'),os=require('node:os');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function abrirIsolado(){
 const owned=process.env.SUITE_QA_REUSE_PROFILE;
 if(owned){
  assert.equal(path.dirname(owned),os.tmpdir());
  assert.ok(path.basename(owned).startsWith('suite-launcher-qa-'));
  const port=Number((await fs.promises.readFile(path.join(owned,'DevToolsActivePort'),'utf8')).split(String.fromCharCode(10))[0].trim());
  assert.ok(Number.isInteger(port)&&port>0);
  return {base:'http://127.0.0.1:'+port,encerrar:async()=>{await fs.promises.rm(owned,{recursive:true,force:true,maxRetries:12,retryDelay:300});}};
 }
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'suite-launcher-qa-'));
 const proc=spawn(process.env.CHROME_PATH,['--headless=new','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 const close=async()=>{
  if(proc.exitCode===null){try{execFileSync('taskkill',['/PID',String(proc.pid),'/T','/F'],{stdio:'ignore'});}catch{}}
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:300}).catch(()=>{});
 };
 try{
  const end=Date.now()+60000;
  while(Date.now()<end){
   try{const port=Number((await fs.promises.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);
    if(port>0)return {base:'http://127.0.0.1:'+port,encerrar:close};}catch{}
   await pause(100);
  }
  throw new Error('Isolated Edge startup timed out');
 }catch(error){await close();throw error;}
}
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const report={ok:false,createdAt:new Date().toISOString(),runtime:'isolated real Edge',pages:[],clicks:[],consoleErrors:[],apiRequests:[]};
let server,chrome,tab;
(async()=>{
 const {handleSuiteLauncher}=await import(pathToFileURL(path.join(root,'cloudflare/center-container/chamados/worker/suite-launcher.js')).href);
 const {handleChamadosNavigation}=await import(pathToFileURL(path.join(root,'cloudflare/center-container/chamados/worker/navigation.js')).href);
 server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1:'+server.address().port);
   if(/^\/api|^\/v1/.test(url.pathname))report.apiRequests.push(url.pathname);
   const request=new Request(url,{method:req.method,headers:req.headers});
   let response=handleSuiteLauncher(request)||handleChamadosNavigation(request,{CHAMADOS_ENABLED:'true'});
   if(!response){
    const allowed={'/m/fonts/plex-400.woff2':'font/woff2','/m/fonts/plex-600.woff2':'font/woff2','/d/simbolo.png':'image/png'};
    if(allowed[url.pathname])response=new Response(fs.readFileSync(path.join(root,'public',url.pathname)),{headers:{'content-type':allowed[url.pathname]}});
    else if(['/d/','/m/'].includes(url.pathname))response=new Response('<!doctype html><title>Existing Centre destination</title><p>Existing Centre destination</p>',{headers:{'content-type':'text/html'}});
    else response=new Response('Not found',{status:404});
   }
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end('QA server error');console.error(error.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 chrome=await abrirIsolado();tab=await novaAba(chrome.base);
 await tab.enviar('Network.enable');
 tab.aoEvento(e=>{if(e.method==='Runtime.exceptionThrown')report.consoleErrors.push(e.params.exceptionDetails.text);});
 fs.mkdirSync(out,{recursive:true});
 const configs=[
  {name:'desktop',width:1440,height:1000,mobile:false,theme:'claro',route:'/'},
  {name:'mobile',width:390,height:844,mobile:true,theme:'claro',route:'/suite/'},
  {name:'mobile-dark',width:390,height:844,mobile:true,theme:'escuro',route:'/suite/'}
 ];
 for(const c of configs){
  await tab.enviar('Emulation.setDeviceMetricsOverride',{width:c.width,height:c.height,deviceScaleFactor:1,mobile:c.mobile});
  await tab.enviar('Emulation.setTouchEmulationEnabled',{enabled:c.mobile});
  await tab.enviar('Network.setUserAgentOverride',{userAgent:c.mobile
   ?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
   :'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'});
  await tab.esquemaDeCor(c.theme);await tab.ir(origin+c.route);
  assert.equal(await tab.esperar('document.querySelectorAll(".app").length===3'),true);
  await tab.avaliar('document.fonts.ready');
  const state=await tab.avaliar('({path:location.pathname,width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.title,links:[...document.querySelectorAll(".app")].map(a=>({id:a.id,url:a.href,label:a.innerText,minHeight:a.getBoundingClientRect().height})),font:getComputedStyle(document.body).fontFamily,fontsReady:document.fonts.check("14px \\"IBM Plex Sans\\"")})');
  assert.equal(state.path,c.route,'no automatic navigation');assert.ok(state.scroll<=state.width,'horizontal overflow');
  assert.equal(new URL(state.links.find(x=>x.id==='app-centro').url).pathname,c.mobile?'/m/':'/d/');
  assert.equal(state.links.length,3);assert.ok(state.links.every(x=>x.minHeight>=44));
  assert.ok(state.fontsReady,'incumbent font loaded');
  await tab.print(path.join(out,c.name+'.png'),{formato:'png'});
  report.pages.push({...c,...state});
  if(c.name==='desktop'){
   await tab.avaliar('document.activeElement.blur()');await tab.tecla('Tab');await tab.tecla('Tab');
   assert.equal(await tab.avaliar('document.activeElement.id'),'app-orcamentos','keyboard choice');
   await tab.clicar('#app-centro');assert.equal(await tab.esperar('location.pathname==="/d/"'),true);
   report.clicks.push({app:'centro',device:c.name,path:await tab.avaliar('location.pathname')});
  }
  if(c.name==='mobile'){
   await tab.clicar('#app-centro');assert.equal(await tab.esperar('location.pathname==="/m/"'),true);
   report.clicks.push({app:'centro',device:c.name,path:await tab.avaliar('location.pathname')});
   await tab.ir(origin+'/suite/');await tab.clicar('#app-orcamentos');
   assert.equal(await tab.esperar('location.hostname==="construtec-orcamentos-cloud.construtec-reports.workers.dev"&&location.pathname==="/m/"',20000),true,'existing Orcamentos mobile selection');
   report.clicks.push({app:'orcamentos',device:c.name,path:await tab.avaliar('location.pathname'),origin:await tab.avaliar('location.origin')});
   await tab.avaliar('sessionStorage.setItem("orc_versao","completa")');
   await tab.ir(origin+'/suite/');await tab.clicar('#app-orcamentos');
   assert.equal(await tab.esperar('location.hostname==="construtec-orcamentos-cloud.construtec-reports.workers.dev"&&location.pathname==="/"',20000),true,'Orcamentos full-version override preserved');
   report.clicks.push({app:'orcamentos',device:c.name,preference:'completa',path:await tab.avaliar('location.pathname')});
   await tab.avaliar('sessionStorage.removeItem("orc_versao")');
  }
 }
 await tab.ir(origin+'/d/');
 await tab.avaliar(`window.CC={session:{user:()=>({role:'admin'})}};document.body.innerHTML='<div class="suite"><div class="pop" role="menu"><a href="https://construtec-orcamentos-cloud.construtec-reports.workers.dev/">Orcamentos</a><a href="https://chamadopro-app.lucas-coelho5923.workers.dev/">ChamadoPro</a><div class="sep"></div></div></div><div id="suite-sheet"><div class="sheet"><a href="https://construtec-orcamentos-cloud.construtec-reports.workers.dev/">Orcamentos</a><a href="https://chamadopro-app.lucas-coelho5923.workers.dev/">ChamadoPro</a></div></div>';const script=document.createElement('script');script.src='/chamados/suite.js';document.body.appendChild(script);`);
 assert.equal(await tab.esperar('document.querySelectorAll("[data-chamados-launch=app]").length===2'),true);
 const navigation=await tab.avaliar('({legacy:[...document.links].filter(a=>a.hostname==="chamadopro-app.lucas-coelho5923.workers.dev").length,orcamentos:[...document.links].filter(a=>a.hostname==="construtec-orcamentos-cloud.construtec-reports.workers.dev").length,chamados:document.querySelectorAll("[data-chamados-launch=app]").length,admin:document.querySelectorAll("[data-chamados-launch=admin]").length})');
 assert.deepEqual(navigation,{legacy:0,orcamentos:2,chamados:2,admin:2});report.navigation=navigation;
 assert.deepEqual(report.apiRequests,[],'launcher does not call private APIs');
 assert.deepEqual(report.consoleErrors,[]);
 report.ok=true;
})().catch(error=>{report.error=error.message;process.exitCode=1;}).finally(async()=>{
 if(tab){try{await tab.enviar('Browser.close');}catch{}tab.fechar();}
 if(chrome)await chrome.encerrar();
 if(server)await new Promise(resolve=>server.close(resolve));
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
