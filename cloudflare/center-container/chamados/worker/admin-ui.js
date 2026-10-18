(() => {
 'use strict';
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={token:null,users:[],selected:null,generation:0,pending:null,detail:null,adjust:null};
 const labels={'chamados.ler':'Consultar chamados e indicadores','chamados.criar':'Abrir chamados',
  'chamados.editar':'Editar chamados e cadastros','chamados.executar':'Executar ordens de serviço','chamados.gerir':'Gerenciar a operação'};
 const message=(selector,text,tone='error')=>{const el=$(selector);if(el){el.textContent=text;el.className=tone;}};
 async function api(path,{method='GET',body,key,token=state.token}={}) {
  const response=await fetch(path,{method,redirect:'error',cache:'no-store',
   headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(key?{'idempotency-key':key}:{}),'x-construtec-app':'centro'},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok || data.ok===false) throw Object.assign(new Error(data.error||'Não foi possível concluir a operação.'),{status:response.status,code:data.code});
  return data;
 }
 function clearSession(text='') {
  state.token=null;state.users=[];state.selected=null;state.detail=null;state.pending=null;state.generation++;
  $('#workspace').hidden=true;$('#logout').hidden=true;$('#login-section').hidden=false;
  $('#users').replaceChildren();$('#detail').replaceChildren();message('#login-message',text);
 }
 const stamp=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'Sem prazo';
 function renderUsers() {
  const term=$('#search-users').value.trim().toLocaleLowerCase('pt-BR');
  const users=state.users.filter(u=>[u.name,u.email].join(' ').toLocaleLowerCase('pt-BR').includes(term));
  $('#users').innerHTML=users.length?users.map(u=>'<button type="button" class="user" data-user="'+esc(u.id)+'" aria-pressed="'+(state.selected===u.id)+'"><span>'+esc(u.name)+'</span><small>'+esc(u.email)+'</small>'+(u.active?'':'<small>Conta desativada</small>')+'</button>').join(''):'<p class="help">Nenhuma conta encontrada.</p>';
 }
 async function loadUsers() {
  const data=await api('/v1/users');state.users=data.users||[];renderUsers();
 }
 async function selectUser(id) {
  if(busy && state.pending) return;
  if(state.pending && !confirm('Há uma alteração ainda sem confirmação. Recarregar consulta o estado salvo. Deseja continuar?')) return;
  state.pending=null;state.selected=id;state.detail=null;renderUsers();
  const generation=++state.generation;$('#detail').innerHTML='<p role="status">Consultando a autorização central…</p>';
  try {
   const data=await api('/v1/users/chamados-access?userId='+encodeURIComponent(id));
   if(generation!==state.generation) return;
   state.detail=data;renderDetail(data);
  } catch(error) {
   if(generation!==state.generation) return;
   if([401,403].includes(error.status)) return clearSession('Entre novamente com uma conta administradora.');
   $('#detail').innerHTML='<h2>Consulta indisponível</h2><p class="error">'+esc(error.message)+'</p><button type="button" id="retry-read">Tentar novamente</button>';
   $('#retry-read').onclick=()=>selectUser(id);
  }
 }
 function renderDetail(data) {
  const g=data.grant,active=g?.active && (!g.expiresAt || Date.parse(g.expiresAt)>Date.now()),portal=g?.identityType==='portal';
  const selected=new Set(g?.scope.clientes||[]),clients=[...data.clients];
  for(const id of selected) if(!clients.some(c=>c.id===id)) clients.push({id,name:'Cliente desativado ou indisponível',inactive:true});
  const value=v=>esc(v);
  $('#detail').innerHTML='<div class="person"><div><h2>'+esc(data.user.name)+'</h2><p>'+esc(data.user.email)+'</p></div><span class="badge '+(active?'active':'')+'">'+(active?'Acesso ativo':g?'Acesso inativo':'Sem concessão')+'</span></div>'
   +(!data.user.active?'<p class="notice">Esta conta está desativada. Você pode revogar uma concessão existente.</p>':'')
   +'<form id="grant-form" class="grant-form"><div class="two"><label>Tipo de acesso<span class="help">Equipe ou portal do cliente</span><select name="identityType"><option value="corporativa" '+(!portal?'selected':'')+'>Equipe corporativa</option><option value="portal" '+(portal?'selected':'')+'>Portal do cliente</option></select></label>'
   +'<label>Validade até <span class="help">Opcional · horário deste computador</span><input name="expiresAt" type="datetime-local" value="'+value(g?.expiresAt?localDate(g.expiresAt):'')+'"></label></div>'
   +'<fieldset><legend>O que esta conta pode fazer</legend><div class="checks">'+Object.entries(labels).map(([cap,label])=>'<label class="check"><input type="checkbox" name="capability" value="'+cap+'" '+((g?.capabilities||['chamados.ler']).includes(cap)?'checked':'')+'><span>'+esc(label)+'</span></label>').join('')+'</div><p class="help">O portal permite consultar e abrir chamados próprios nos clientes selecionados.</p></fieldset>'
   +'<fieldset><legend>Clientes e atribuição</legend><label>Abrangência<select name="scope"><option value="all" '+(!g?.scope.restrito?'selected':'')+'>Todos os clientes</option><option value="selected" '+(g?.scope.restrito?'selected':'')+'>Somente clientes selecionados</option></select></label>'
   +'<div id="client-choices"><label class="client-filter">Buscar cliente<input id="client-search" type="search" placeholder="Nome do cliente"></label><div class="clients">'+clients.map(c=>'<label class="check" data-client-name="'+esc(c.name.toLocaleLowerCase('pt-BR'))+'"><input type="checkbox" name="client" value="'+esc(c.id)+'" '+(selected.has(c.id)?'checked':'')+'><span>'+esc(c.name)+(c.inactive?' · remova para salvar':'')+'</span></label>').join('')+'</div>'
   +(!data.clientsAvailable?'<p class="notice">O catálogo de clientes está indisponível. A seleção exige uma nova consulta antes de salvar.</p>':!clients.length?'<p class="help">Cadastre os clientes no Chamados antes de conceder acesso restrito.</p>':'')+'</div>'
   +'<label id="assigned-label" class="check"><input name="assigned" type="checkbox" '+(g?.scope.somenteAtribuidos?'checked':'')+'><span>Somente chamados e ordens atribuídos a esta pessoa</span></label></fieldset>'
   +'<label>Motivo da alteração<textarea name="reason" rows="3" maxlength="500" minlength="5" required placeholder="Descreva por que este acesso está sendo concedido, ajustado ou revogado."></textarea></label>'
   +'<p id="grant-message" role="status" aria-live="polite"></p><div class="actions"><button class="primary" type="submit" '+(!data.user.active?'disabled':'')+'>Salvar acesso</button>'
   +(g?.active?'<button type="button" class="danger" id="revoke">Revogar acesso</button>':'')+'<button type="button" id="reload">Recarregar acesso</button></div></form>'
   +'<section class="history"><h3>Histórico de alterações</h3>'+(data.history.length?'<ol>'+data.history.map(h=>'<li><b>'+esc(h.action==='revoke'?'Acesso revogado':'Acesso definido')+'</b><small>'+esc(stamp(h.createdAt))+' · '+esc(h.actorName)+' · revisão '+h.revision+'</small><p>'+esc(h.reason)+'</p></li>').join('')+'</ol>':'<p class="help">Nenhuma alteração registrada por esta administração.</p>')+'</section>';
  const form=$('#grant-form');
  const adjust=()=>{
   const isPortal=form.elements.identityType.value==='portal';
   if(isPortal) {form.elements.scope.value='selected';form.elements.assigned.checked=false;}
   form.elements.scope.disabled=isPortal;
   form.querySelectorAll('[name=capability]').forEach(c=>{const disabled=isPortal&&!['chamados.ler','chamados.criar'].includes(c.value);c.disabled=disabled;if(disabled)c.checked=false;});
   $('#client-choices').hidden=form.elements.scope.value!=='selected';
   $('#assigned-label').hidden=isPortal || form.elements.scope.value!=='selected';
   if(form.elements.scope.value!=='selected') form.elements.assigned.checked=false;
  };
  state.adjust=adjust;form.elements.identityType.onchange=adjust;form.elements.scope.onchange=adjust;adjust();
  $('#client-search').oninput=e=>{const term=e.target.value.trim().toLocaleLowerCase('pt-BR');form.querySelectorAll('[data-client-name]').forEach(el=>el.hidden=!el.dataset.clientName.includes(term));};
  form.onsubmit=e=>{e.preventDefault();submit('save');};
  if($('#revoke')) $('#revoke').onclick=()=>submit('revoke');
  $('#reload').onclick=()=>selectUser(state.selected);
 }
 function localDate(value) {const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
 function payload(action) {
  const form=$('#grant-form'),reason=form.elements.reason.value.trim(),d=state.detail;
  if(reason.length<5) throw new Error('Informe um motivo com pelo menos cinco caracteres.');
  const base={action,userId:d.user.id,expectedRevision:d.grant?.revision||0,reason};
  if(action==='revoke') return base;
  const capabilities=[...form.querySelectorAll('[name=capability]:checked')].map(i=>i.value).sort();
  if(!capabilities.includes('chamados.ler')) throw new Error('Mantenha a permissão de consulta para a conta utilizar o módulo.');
  const restrito=form.elements.scope.value==='selected';
  const clientes=restrito?[...form.querySelectorAll('[name=client]:checked')].map(i=>i.value).sort():[];
  if(restrito && (!d.clientsAvailable || !clientes.length)) throw new Error('Selecione ao menos um cliente ativo.');
  const raw=form.elements.expiresAt.value,expiresAt=raw?new Date(raw).toISOString():null;
  if(expiresAt && Date.parse(expiresAt)<=Date.now()) throw new Error('A validade deve estar no futuro.');
  return {...base,identityType:form.elements.identityType.value,capabilities,
   scope:{restrito,clientes,somenteAtribuidos:restrito&&form.elements.assigned.checked},expiresAt};
 }
 let busy=false;
 async function submit(action) {
  if(busy) return;
  let pending=state.pending;
  try {
   if(!pending) pending={body:payload(action),key:crypto.randomUUID()};
   if(pending.body.action!==action) throw new Error('Confirme a tentativa anterior ou recarregue o acesso antes de outra ação.');
  } catch(error) {message('#grant-message',error.message);return;}
  state.pending=pending;busy=true;
  const form=$('#grant-form');form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
  message('#grant-message','Confirmando a alteração…','help');
  try {
   await api('/v1/users/chamados-access',{method:'POST',body:pending.body,key:pending.key});
   state.pending=null;message('#page-message',action==='revoke'?'Acesso revogado. O histórico foi preservado.':'Acesso salvo e registrado no histórico.','success');
   await loadUsers().catch(()=>message('#page-message','A alteração foi salva. Atualize a lista de contas quando a conexão voltar.','success'));
   await selectUser(pending.body.userId);
  } catch(error) {
   if([401,403].includes(error.status)) {clearSession('Sua sessão não pode mais administrar os acessos. Entre novamente.');return;}
   if([400,404,409,413].includes(error.status)) {
    state.pending=null;form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);
    state.adjust?.();form.querySelector('[type=submit]').disabled=!state.detail.user.active;
    if(error.status===409) {message('#grant-message',error.message+' Use Recarregar acesso.');form.querySelector('[type=submit]').disabled=true;if($('#revoke'))$('#revoke').disabled=true;}
    else message('#grant-message',error.message);
   } else {
    message('#grant-message','A confirmação ainda não chegou. Tente confirmar novamente ou recarregue para consultar o estado salvo.');
    const retry=action==='save'?form.querySelector('[type=submit]'):$('#revoke');
    if(retry){retry.disabled=false;retry.textContent='Tentar confirmar novamente';}
   }
   if($('#reload')) $('#reload').disabled=false;
  } finally {busy=false;}
 }
 $('#login-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;message('#login-message','Verificando sua conta…','help');
  try {
   const data=await api('/v1/auth/login',{method:'POST',token:null,body:{email:form.elements.email.value.trim(),password:form.elements.password.value}});
   form.elements.password.value='';
   if(data.challenge || data.mfaRequired || data.requiresMfa || data.nextStep || !data.sessionToken) throw new Error('Conclua a autenticação exigida pela Suíte antes de continuar.');
   if(data.user?.role!=='admin' || (data.user.suiteRole && data.user.suiteRole!=='admin')) {
    await api('/v1/auth/logout',{method:'POST',body:{},token:data.sessionToken}).catch(()=>{});
    throw new Error('Esta área exige uma conta administradora da Suíte.');
   }
   state.token=data.sessionToken;await loadUsers();$('#login-section').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;message('#login-message','');
  } catch(error) {state.token=null;message('#login-message',error.message);}
  finally {button.disabled=false;}
 };
 $('#logout').onclick=async()=>{if(busy)return;const token=state.token;clearSession();await api('/v1/auth/logout',{method:'POST',body:{},token}).catch(()=>{});};
 $('#search-users').oninput=renderUsers;
 $('#users').onclick=e=>{const b=e.target.closest('[data-user]');if(b)selectUser(b.dataset.user);};
 $('#refresh-users').onclick=async()=>{try {await loadUsers();message('#page-message','Contas atualizadas.','success');}catch(error){message('#page-message',error.message);}};
})();
