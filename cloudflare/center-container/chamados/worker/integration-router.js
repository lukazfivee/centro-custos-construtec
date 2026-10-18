// New Chamados routes only. An outer Worker delegates undefined results to its unchanged production bundle.
import { handleCentralAuth } from '../../centralAuth.js';
import { handleChamadosCentral,issueChamadosHandoff,consumeChamadosHandoffResponse } from './chamados-central.js';
import { handleChamadosEntry } from './entry-page.js';
import { handleChamadosAdminPage } from './admin-page.js';
import { handleChamadosGrantAdmin } from './grant-admin.js';
import { handleChamadosNotifications } from './notifications.js';

export async function handleChamadosIntegration(request,env,_ctx) {
 const url=new URL(request.url),path=url.pathname;
 const entry=await handleChamadosEntry(request,env);
 if(entry) return entry;
 const page=handleChamadosAdminPage(request,env);
 if(page) return page;
 const notification=await handleChamadosNotifications(request,env);
 if(notification) return notification;
 const admin=await handleChamadosGrantAdmin(request,env);
 if(admin) return admin;
 const session=await handleChamadosCentral(request,env);
 if(session) return session;
 if(request.method==='POST' && path==='/v1/auth/login' && request.headers.get('x-construtec-app')==='chamados') {
  if(env.CHAMADOS_ENABLED!=='true') return Response.json({ok:false,error:'Chamados indisponível.'},{status:503});
  return handleCentralAuth(request,env);
 }
 if(request.method==='POST' && ['/v1/auth/handoff','/v1/auth/handoff/consume'].includes(path)) {
  let body;try {const text=await request.clone().text();if(text.length>4096)return undefined;body=JSON.parse(text);}
  catch {return undefined;}
  if(body?.target!=='chamados') return undefined;
  return path==='/v1/auth/handoff'?issueChamadosHandoff(request,env,body)
   :consumeChamadosHandoffResponse(request,env,body);
 }
 return undefined;
}
