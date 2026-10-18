import { adminDocument,adminScript,adminStyles } from './admin-assets.js';
export function handleChamadosAdminPage(request,env) {
 const path=new URL(request.url).pathname;
 const assets={'/chamados/acessos':[adminDocument,'text/html'],'/chamados/acessos.js':[adminScript,'application/javascript'],
  '/chamados/acessos.css':[adminStyles,'text/css']};
 if(!assets[path]) return undefined;
 if(env.CHAMADOS_ENABLED!=='true') return new Response(null,{status:404});
 if(!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
 const [body,type]=assets[path];
 return new Response(request.method==='HEAD'?null:body,{headers:{'content-type':type+'; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'x-frame-options':'DENY'}});
}
