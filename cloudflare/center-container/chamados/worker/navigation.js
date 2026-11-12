// Additive navigation for a deployment wrapping the byte-preserved production Worker.
import { navigationScript } from './navigation-assets.js';
const PAGES=new Set(['/d','/d/','/d/index.html','/m','/m/','/m/index.html']);
const eligible=(request,env)=>env.CHAMADOS_ENABLED==='true' && request.method==='GET'
 && PAGES.has(new URL(request.url).pathname);
export function handleChamadosNavigation(request,env) {
 if(new URL(request.url).pathname!=='/chamados/suite.js')return undefined;
 if(env.CHAMADOS_ENABLED!=='true')return new Response(null,{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
 return new Response(request.method==='HEAD'?null:navigationScript,{headers:{
  'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export function prepareChamadosNavigationRequest(request,env) {
 if(!eligible(request,env))return request;
 const headers=new Headers(request.headers);
 headers.delete('if-none-match');headers.delete('if-modified-since');
 return new Request(request,{headers});
}
export function injectChamadosNavigation(request,response,env) {
 if(!eligible(request,env) || response.status!==200
  || !response.headers.get('content-type')?.toLowerCase().includes('text/html'))return response;
 const rewritten=new HTMLRewriter().on('body',{element(element){
  element.append('<script src="/chamados/suite.js" defer></script>',{html:true});
 }}).transform(response);
 rewritten.headers.delete('etag');rewritten.headers.delete('last-modified');rewritten.headers.delete('content-length');
 rewritten.headers.set('cache-control','no-store');
 return rewritten;
}
