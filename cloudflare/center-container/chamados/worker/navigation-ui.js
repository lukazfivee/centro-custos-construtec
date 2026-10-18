// Additive links for the preserved desktop/mobile Suite. No session/token is read or copied.
(() => {
 'use strict';
 const icon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6 4-4 4 4-4 4m-4-4-3 3-4-1-5 5 5 5 5-5-1-4 3-3ZM6 14l4 4"/></svg>';
 const arrow='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 5h11v11M19 5 5 19"/></svg>';
 function item(mobile,admin=false) {
  const a=document.createElement('a');a.href=admin?'/chamados/acessos':'/chamados/entrar';
  a.target='_blank';a.rel='noopener';a.dataset.chamadosLaunch=admin?'admin':'app';
  a.className=mobile?'suite-item':'res';if(!mobile)a.setAttribute('role','menuitem');
  const title=admin?'Acessos ao Chamados':'Chamados e O.S.',sub=admin?'Administração da Suíte':'Atendimento e manutenção';
  a.innerHTML=mobile?icon+'<span><b>'+title+'</b><small>'+sub+'</small></span>'+arrow
   :'<span class="ic">'+icon+'</span><span class="tx"><b>'+title+'</b><span>'+sub+'</span></span>'+arrow;
  return a;
 }
 function refresh() {
  let admin=false;try{admin=window.CC?.session?.user?.()?.role==='admin';}catch{}
  for(const [selector,mobile] of [['.suite .pop[role="menu"]',false],['#suite-sheet .sheet',true]]) {
   const parent=document.querySelector(selector);if(!parent)continue;
   for(const link of parent.querySelectorAll('a[href]')) {
    let url;try{url=new URL(link.href);}catch{continue;}
    if(url.origin==='https://chamadopro-app.lucas-coelho5923.workers.dev' && url.pathname==='/') {
     const existing=parent.querySelector('[data-chamados-launch=\"app\"]');
     if(existing)link.remove();else link.replaceWith(item(mobile));
    }
   }
   // Centro novo: o proprio menu (public/d/suite.js e public/m/suite.js) cuida do item e da concessao.
   const native=parent.querySelector('[data-chamados-slot]');
   if(!native && !parent.querySelector('[data-chamados],[data-chamados-launch="app"]')) {
    const a=item(mobile),before=mobile?null:parent.querySelector('.sep');parent.insertBefore(a,before);
   }
   const existing=parent.querySelector('[data-chamados-launch="admin"]');
   if(admin&&!existing)parent.appendChild(item(mobile,true));
   if(!admin&&existing)existing.remove();
  }
 }
 let queued=false;
 const observer=new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;refresh();});}});
 const start=()=>{refresh();observer.observe(document.body,{childList:true,subtree:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
