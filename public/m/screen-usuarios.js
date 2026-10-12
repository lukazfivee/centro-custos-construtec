// Usuarios no celular, so p9 como no desktop (public/d/telas/usuarios*.js): lista com busca e filtro,
// convites pendentes, ativar/desativar, editar acesso e criar (screen-usuario-form.js), papeis e
// permissoes, e-mails externos e "Ver o sistema como" (screen-papeis.js). Os pedidos de acesso e o
// codigo da empresa ficam em screen-pedidos.js, aberto daqui. Rotas: routes/users.js e usersAccess.js.
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm;
  const X = CC.usu = CC.usu || {};

  X.PAPEIS = [['admin', 'Administrador', 'tudo'], ['gestor', 'Gestor', 'obras e equipe'], ['financeiro', 'Financeiro', 'caixa e cobranças'],
    ['engenharia', 'Engenharia', 'orçamento e obra'], ['tecnico', 'Técnico de campo', 'celular em obra'], ['comercial', 'Comercial', 'propostas']];
  X.ESCOPADOS = ['engenharia', 'tecnico']; // so veem as obras escolhidas
  X.APPS = [['orcamentos', 'Orçamentos'], ['centro', 'Centro de Custos']];
  X.GRUPOS = [
    ['Centro de Custos', [['p1', 'Ver painel financeiro', 'Indicadores, evolução mensal e resultado'], ['p2', 'Lançar despesas', 'Inclusive pela câmera do celular, com NF'], ['p3', 'Editar e excluir lançamentos', 'Fica registrado no histórico'], ['p4', 'Estornar lançamentos', 'Cria o lançamento inverso'], ['p12', 'Registrar horas e medições', 'Apontamento da equipe e boletins']]],
    ['Financeiro e cadastros', [['p5', 'Cadastros', 'Categorias, fornecedores e recorrentes'], ['p6', 'Cobranças', 'Acompanhar e preparar e-mails ao cliente'], ['p7', 'Autorizar envio de cobrança', 'Libera o e-mail para o cliente'], ['p8', 'Fechamento mensal', 'Fechar e reabrir competências']]],
    ['Orçamentos e administração', [['p10', 'Ver custo, BDI e margem', 'No detalhe das propostas'], ['p11', 'Enviar e aprovar propostas', 'Gerar PDF e registrar aprovação'], ['p9', 'Usuários, permissões e configurações', 'Usuários, histórico e sistema']]],
  ];
  X.nomePapel = (v) => (X.PAPEIS.find((p) => p[0] === v) || [v, 'Usuário'])[1];
  X.nomeApp = (v) => (X.APPS.find((a) => a[0] === v) || [v, v])[1];
  X.lista = (data) => (Array.isArray(data) ? data : (data && Array.isArray(data.itens) ? data.itens : []));
  // Matriz atual (papeis x permissoes), lida de novo a cada abertura da aba.
  let matriz = null;
  X.matriz = async (forcar) => { if (!matriz || forcar) matriz = (await CC.api('/usuarios/permissoes')).data; return matriz; };
  X.guardarMatriz = (d) => { matriz = d; };
  X.obrasTexto = (u) => {
    if (!X.ESCOPADOS.includes(u.suiteRole) || u.todasObras) return 'Todas as obras';
    const n = (u.obras || []).length;
    return n ? A.plural(n, 'obra', 'obras') : 'Sem obras';
  };

  let busca = '', filtro = 'todos';
  const FILTROS = [['todos', 'Todos'], ['ativos', 'Ativos'], ['convites', 'Convites'], ['desativados', 'Desativados']];

  function acoesUsuario(u, recarregar) {
    const ativo = u.ativo !== false;
    const eu = Number(u.id) === Number((CC.session.user() || {}).id);
    const item = (id, ic, t, s, cls) => `<button type="button" class="suite-item om-item${cls ? ` ${cls}` : ''}" id="${id}">${icon(ic, 22)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`;
    const sh = CC.sheet('adm-usu', `${CC.sheetHead('user-plus', u.nome || u.email)}
      <p class="sheet-sec">${esc(u.email)}</p>
      <div class="card" style="margin-bottom:10px"><div class="kv"><span>Papel</span><b>${esc(X.nomePapel(u.suiteRole))}</b></div>
        <div class="kv"><span>Obras</span><b>${esc(X.obrasTexto(u))}</b></div><div class="kv"><span>Apps</span><b>${esc((u.apps || []).map(X.nomeApp).join(', ') || '—')}</b></div>
        <div class="kv"><span>Último acesso</span><b>${esc(u.ultimoAcesso ? A.dia(u.ultimoAcesso) : 'Nunca entrou')}</b></div></div>
      ${eu ? '<p class="adm-nota">Você não pode alterar o próprio papel nem desativar o próprio acesso.</p>'
        : `${item('us-edit', 'pencil-simple', 'Editar acesso', 'Papel, apps e obras que a pessoa pode ver')}
      ${item('us-status', ativo ? 'lock-simple' : 'check-circle', ativo ? 'Desativar acesso' : 'Ativar acesso', ativo ? 'A pessoa perde o acesso; o histórico dela fica' : 'A pessoa volta a acessar o sistema', ativo ? 'danger' : '')}`}
      <div id="us-err"></div>`);
    const edit = CC.$('#us-edit', sh.el);
    if (edit) edit.addEventListener('click', () => { sh.close(); CC.go('usuario-form', { id: u.id }); });
    const st = CC.$('#us-status', sh.el);
    if (st) st.addEventListener('click', async () => {
      if (!A.armado(st.querySelector('b'), ativo ? 'Toque de novo para desativar' : 'Toque de novo para ativar')) return;
      st.disabled = true;
      try { await CC.api(`/usuarios/${u.id}/status`, { method: 'PUT', body: { ativo: !ativo } }); } catch (error) {
        st.disabled = false;
        CC.$('#us-err', sh.el).innerHTML = CC.sheetErr(error);
        return;
      }
      sh.close();
      CC.toast(ativo ? 'Acesso desativado' : 'Acesso ativado');
      recarregar();
    });
  }

  CC.screens.usuarios = async function (params) {
    if (!(await A.guard(params, 'p9', 'Usuários'))) return;
    const topo = A.top('Usuários', 'Quem acessa a Suíte, com que papel e em quais obras');
    A.voltar(CC.render(`${topo}<div class="skeleton"></div><div class="skeleton"></div>`, true, params));
    let todos, ped;
    try {
      [todos, ped] = await Promise.all([CC.api('/usuarios').then((r) => X.lista(r.data)), CC.api('/cadastros').then((r) => r.data).catch(() => ({}))]);
    } catch (error) {
      const el = CC.render(`${topo}<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 28)}${esc(A.erroTexto(error, 'A lista de usuários'))}
        <button class="btn2" type="button" id="retry" style="padding:0 18px">Tentar de novo</button></div>`, true, params);
      A.voltar(el);
      CC.$('#retry', el).addEventListener('click', () => CC.screens.usuarios(params));
      return;
    }
    const convites = Array.isArray(ped && ped.invites) ? ped.invites : [];
    const pedidos = Array.isArray(ped && ped.requests) ? ped.requests : [];
    X.convitesOk = Boolean(ped && ped.code); // convite por e-mail so com a conta corporativa
    const ativos = todos.filter((u) => u.ativo !== false);
    const kpi = (rotulo, n, tom) => `<div class="adm-kpi"><b class="${tom || ''}">${n}</b><small>${esc(rotulo)}</small></div>`;
    const link = (id, ic, t, s) => `<button type="button" class="suite-item om-item" id="${id}">${icon(ic, 22)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span>${icon('caret-right', 18)}</button>`;
    const el = CC.render(`${topo}
      <div class="adm-kpis">${kpi('Ativos', ativos.length, 'ok')}${kpi('Convites', convites.length)}${kpi('Desativados', todos.length - ativos.length)}${kpi('Pedidos', pedidos.length, pedidos.length ? 'warn' : '')}</div>
      <button class="btn" type="button" id="us-novo">${icon('user-plus', 18)}${X.convitesOk ? 'Convidar ou criar usuário' : 'Novo usuário'}</button>
      <div>${ped && ped.disponivel !== false && CC.screens.pedidos ? link('us-pedidos', 'user-plus', 'Pedidos de acesso', pedidos.length ? `${A.plural(pedidos.length, 'pedido aguardando', 'pedidos aguardando')} · código da empresa` : 'Aprovar cadastros, convidar e código da empresa') : ''}
        ${CC.screens.papeis ? link('us-papeis', 'shield-check', 'Papéis e permissões', 'O que cada papel pode fazer, no celular e no computador') : ''}
        ${CC.screens['emails-ext'] ? link('us-emails', 'envelope-simple', 'E-mails externos', 'E-mails fora da empresa autorizados a criar conta') : ''}
        ${CC.usu.comoSheet ? link('us-como', 'eye-slash', 'Ver o sistema como', 'Mostra o celular como outro papel vê. Só visual') : ''}</div>
      <label class="field busca"><span class="sr">Buscar</span>${icon('magnifying-glass', 18)}<input id="us-busca" type="search" autocomplete="off" value="${esc(busca)}" placeholder="Nome ou e-mail"></label>
      <div class="seg" role="group" aria-label="Situação">${FILTROS.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filtro}">${l}</button>`).join('')}</div>
      <div id="us-lista"></div>`, true, params);
    A.voltar(el);
    const recarregar = () => { if (params.__nav === CC.nav) CC.screens.usuarios(params).catch(() => {}); };
    const ir = (id, fn) => { const b = CC.$(id, el); if (b) b.addEventListener('click', fn); };
    ir('#us-novo', () => CC.go('usuario-form', { convitesOk: X.convitesOk }));
    ir('#us-pedidos', () => CC.go('pedidos', { from: 'usuarios' }));
    ir('#us-papeis', () => CC.go('papeis'));
    ir('#us-emails', () => CC.go('emails-ext'));
    ir('#us-como', () => CC.usu.comoSheet());
    const pintar = () => {
      const q = busca.trim().toLowerCase();
      const passa = (t) => !q || t.toLowerCase().includes(q);
      const us = todos.filter((u) => passa(`${u.nome || ''} ${u.email || ''}`) && (filtro === 'todos' || (filtro === 'ativos' && u.ativo !== false) || (filtro === 'desativados' && u.ativo === false)));
      const cs = filtro === 'todos' || filtro === 'convites' ? convites.filter((c) => passa(c.email || '')) : [];
      const linhas = us.map((u) => `<button class="adm-row${u.ativo === false ? ' off' : ''}" type="button" data-u="${Number(u.id)}"><span class="adm-av">${esc(A.iniciais(u.nome || u.email))}</span>
          <span class="grow"><b>${esc(u.nome || u.email)}</b><small>${esc(u.email)}</small><small class="adm-det">${esc(`${X.nomePapel(u.suiteRole)} · ${X.obrasTexto(u)} · ${(u.apps || []).map(X.nomeApp).join(', ')}`)}</small></span>
          <span class="tag${u.ativo === false ? '' : ' ok'}">${u.ativo === false ? 'Desativado' : 'Ativo'}</span></button>`)
        .concat(cs.map((c) => `<div class="adm-row"><span class="adm-av">${icon('envelope-simple', 16)}</span><span class="grow"><b>${esc(c.email)}</b>
          <small>${esc(X.nomePapel(c.suiteRole || c.role))} · aguardando cadastro no app</small></span>
          <button class="chip-act" type="button" data-reenviar="${esc(c.email)}" data-papel="${esc(c.suiteRole || 'tecnico')}">Reenviar</button></div>`)).join('');
      CC.$('#us-lista', el).innerHTML = linhas ? `<div class="adm-lista solta">${linhas}</div>` : `<div class="empty">${icon('user-plus', 28)}Nenhum usuário encontrado.</div>`;
      CC.$$('[data-u]', el).forEach((b) => b.addEventListener('click', () => { const u = todos.find((x) => String(x.id) === b.dataset.u); if (u) acoesUsuario(u, recarregar); }));
      CC.$$('[data-reenviar]', el).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await CC.api('/cadastros/convites', { method: 'POST', body: { email: b.dataset.reenviar, papel: b.dataset.papel } }); CC.toast('Convite reenviado'); }
        catch (error) { CC.toast(A.erroTexto(error, 'Reenviar o convite'), 'warning-circle'); }
        b.disabled = false;
      }));
    };
    CC.$('#us-busca', el).addEventListener('input', (e) => { busca = e.target.value; pintar(); });
    CC.$$('[data-f]', el).forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; CC.$$('[data-f]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); pintar(); }));
    pintar();
  };
})(window.CC = window.CC || {});
