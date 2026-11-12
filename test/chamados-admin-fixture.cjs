const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
let DatabaseSync;try{({DatabaseSync}=require('node:sqlite'));}catch{}
const hasSqlite=Boolean(DatabaseSync); // Node 20 (CI) não tem node:sqlite: os testes do Chamados se pulam.
const {setup}=require('./password-reset-fixture.test');
const ROOT=path.join(__dirname,'..'),WORKER=path.join(ROOT,'cloudflare/center-container');
function sqliteD1() {
 const raw=new DatabaseSync(':memory:');
 const prepare=sql=>({args:[],bind(...args){this.args=args;return this;},
 async first(){return raw.prepare(sql).get(...this.args)||null;},
 async all(){return {results:raw.prepare(sql).all(...this.args)};},
 async run(){return {meta:{changes:Number(raw.prepare(sql).run(...this.args).changes)}};}});
 return {raw,prepare,async batch(list){raw.exec('BEGIN');try {const out=[];for(const x of list)out.push(await x.run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
async function adminFixture(t) {
 const base=await setup(),{env}=base;
 for(const name of ['014-chamados-access.sql','015-chamados-grant-audit.sql']) env.DB.raw.exec(fs.readFileSync(path.join(WORKER,'d1-migrations',name),'utf8'));
 Object.assign(env,{CHAMADOS_ENABLED:'true',CHAMADOS_PUBLIC_ORIGIN:'https://chamados.test',
 CHAMADOS_ORGANIZATION_ID:'rcconstrutec.com.br',CHAMADOS_SERVICE_KEY:'c'.repeat(40),CHAMADOS_DB:sqliteD1()});
 env.CHAMADOS_DB.raw.exec(`CREATE TABLE cc_entities(id TEXT PRIMARY KEY,organization_id TEXT,type TEXT,name TEXT,active INTEGER);
 INSERT INTO cc_entities VALUES('client-one','rcconstrutec.com.br','clientes','Hospital Um',1),
 ('inactive','rcconstrutec.com.br','clientes','Inativo',0),('foreign','other','clientes','Outra empresa',1);`);
 const admin=(await base.call('GET','/v1/auth/session',{token:base.token})).data.user;
 const handler=await import(pathToFileURL(path.join(WORKER,'chamados/worker/grant-admin.js')).href);
 const central=await import(pathToFileURL(path.join(WORKER,'chamados/worker/chamados-central.js')).href);
 async function request(method,{body,userId=admin.id,token=base.token,key=crypto.randomUUID(),headers={}}={}) {
  const r=await handler.handleChamadosGrantAdmin(new Request('https://central.test/v1/users/chamados-access'+(method==='GET'?'?userId='+userId:''),{
   method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),
    'idempotency-key':key,...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:r.status,data:await r.json()};
 }
 const save=(patch={})=>({action:'save',userId:admin.id,expectedRevision:0,reason:'Acesso para operação',
 identityType:'corporativa',capabilities:['chamados.ler','chamados.criar','chamados.editar','chamados.executar','chamados.gerir'],
 scope:{restrito:false,clientes:[],somenteAtribuidos:false},expiresAt:null,...patch});
 t.after(()=>{env.DB.raw.close();env.CHAMADOS_DB.raw.close();});
 return {...base,admin,request,save,central};
}
module.exports={hasSqlite,adminFixture,sqliteD1,WORKER};
