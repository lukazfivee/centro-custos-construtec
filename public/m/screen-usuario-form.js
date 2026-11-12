// Criar usuario (convite por e-mail ou senha provisoria) e editar acesso (papel, apps e obras), como
// em public/d/telas/usuarios-form.js. Rotas: POST /usuarios, PUT /usuarios/:id/acesso e
// POST /cadastros/convites. Nome e e-mail de quem ja existe nao mudam por aqui.
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Senha provisoria aleatoria (sem letras parecidas), para nao digitar 10 caracteres no celular.
  function gerarSenha() {
    const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const n = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(n, (b) => letras[b % letras.length]).join('');
  }

  function oQuePode(papel, dados) {
    const linhas = CC.usu.GRUPOS.flatMap(([, itens]) => itens).map(([id, nome]) => {
      const ok = papel === 'admin' || !!(dados.matriz[papel] && dados.matriz[papel][id]);
      return `<li class="${ok ? 'sim' : 'nao'}">${icon(ok ? 'check-circle' : 'x', 16)}${esc(nome)}</li>`;
    }).join('');
    return `<span class="label">O que ${esc(CC.usu.nomePapel(papel))} pode fazer</span><ul class="adm-pode">${linhas}</ul>`;
  }

  function sucesso(el, titulo, texto, extra) {
    const page = CC.render(`${A.top(titulo)}<div class="od-done">${CC.success(72, titulo)}<b>${esc(titulo)}</b><small>${esc(texto)}</small></div>${extra}
      <div class="actions"><button class="btn" type="button" id="uf-ok">Concluir</button></div>`, true);
    document.body.classList.add('no-tabs');
    A.voltar(page, 'usuarios');
    CC.$('#uf-ok', page).addEventListener('click', () => CC.go('usuarios'));
    return page;
  }

  CC.screens['usuario-form'] = async function (params) {
    if (!(await A.guard(params, 'p9', 'Usuários'))) return;
    const X = CC.usu;
    const id = Number(params.id) || 0;
    const editando = id > 0;
    A.voltar(CC.render(`${A.top(editando ? 'Editar acesso' : 'Novo usuário')}<div class="skeleton"></div>`, true, params), 'usuarios');
    let dados, obras, usuario = null, convitesOk = !!params.convitesOk;
    try {
      const pedidos = editando || params.convitesOk !== undefined ? null : CC.api('/cadastros').then((r) => r.data).catch(() => ({}));
      [dados, obras, usuario] = await Promise.all([
        X.matriz(true),
        CC.api('/centros-custo').then((r) => X.lista(r.data)).catch(() => []),
        editando ? CC.api('/usuarios').then((r) => X.lista(r.data).find((u) => Number(u.id) === id) || null) : null,
      ]);
      if (pedidos) convitesOk = Boolean((await pedidos).code);
    } catch (error) {
      return CC.errorScreen(document.getElementById('view'), error, () => CC.screens['usuario-form'](params));
    }
    if (editando && !usuario) { CC.toast('Este usuário não existe mais.', 'warning-circle'); return CC.go('usuarios'); }
    const st = {
      papel: (usuario && usuario.suiteRole) || 'tecnico',
      apps: usuario && usuario.apps && usuario.apps.length ? [...usuario.apps] : ['orcamentos', 'centro'],
      todas: usuario ? usuario.todasObras !== false : false,
      obras: ((usuario && usuario.obras) || []).map(Number),
      metodo: convitesOk && !editando ? 'convite' : 'senha',
    };
    const titulo = editando ? 'Editar acesso' : (convitesOk ? 'Convidar usuário' : 'Novo usuário');
    const el = CC.render(`${A.top(titulo, editando ? X.nomePapel(usuario.suiteRole || 'tecnico') : 'Papel, apps e obras que a pessoa pode ver')}
      ${editando ? `<div class="card"><div class="kv"><span>Nome</span><b>${esc(usuario.nome || '')}</b></div><div class="kv"><span>E-mail</span><b>${esc(usuario.email)}</b></div></div>
        ${usuario.cloud_managed ? '<p class="adm-nota">Nome e e-mail vêm do diretório central; aqui mudam papel, apps e obras.</p>' : ''}`
        : `${convitesOk ? `<div><span class="label">Como a pessoa entra</span><div class="seg" role="group" aria-label="Método">
          <button type="button" data-metodo="convite" aria-pressed="true">Convite por e-mail</button><button type="button" data-metodo="senha" aria-pressed="false">Senha provisória</button></div></div>`
          : '<p class="adm-nota">Sem conta corporativa, o acesso é por senha provisória.</p>'}
        <label class="field" id="uf-nome-box"${st.metodo === 'convite' ? ' hidden' : ''}><span>Nome</span><input id="uf-nome" maxlength="120" autocomplete="off"></label>
        <label class="field"><span>E-mail</span><input id="uf-email" type="email" inputmode="email" autocomplete="off" maxlength="180" placeholder="nome@empresa.com.br"></label>`}
      <label class="field"><span>Papel</span><select id="uf-papel">${X.PAPEIS.map(([v, l, n]) => `<option value="${v}"${v === st.papel ? ' selected' : ''}>${esc(l)} · ${esc(n)}</option>`).join('')}</select></label>
      <div><span class="label">Acesso aos apps</span><div class="adm-toggles">${X.APPS.map(([v, l]) => `<button type="button" class="chip-act" data-app="${v}" aria-pressed="${st.apps.includes(v)}">${icon('check', 16)}${esc(l)}</button>`).join('')}</div></div>
      <div id="uf-obras"></div>
      ${editando ? '' : `<div id="uf-senha-box"${st.metodo === 'convite' ? ' hidden' : ''}><label class="field"><span>Senha provisória</span><input id="uf-senha" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" minlength="10"></label>
        <button class="btn2" type="button" id="uf-gerar" style="width:100%;margin-top:8px">${icon('key', 18)}Gerar senha</button>
        <p class="adm-nota">Pelo menos 10 caracteres. Informe a senha à pessoa por um canal seguro.</p></div>`}
      <div class="card" id="uf-pode"></div>
      <p class="alert" role="alert" id="uf-erro"></p>
      <div class="actions"><button class="btn" type="button" id="uf-salvar">${icon('check', 18)}<span>${editando ? 'Salvar acesso' : (st.metodo === 'convite' ? 'Enviar convite' : 'Criar usuário')}</span></button></div>`, true, params);
    document.body.classList.add('no-tabs');
    A.voltar(el, 'usuarios');
    const erro = (t) => { CC.$('#uf-erro', el).textContent = t || ''; };
    const pintarObras = () => {
      const box = CC.$('#uf-obras', el);
      const tecnico = st.papel === 'tecnico';
      if (tecnico) st.todas = false;
      const escopado = X.ESCOPADOS.includes(st.papel);
      if (!escopado) { box.innerHTML = '<p class="adm-nota">Este papel vê todas as obras.</p>'; return; }
      if (!editando && st.metodo === 'convite') { box.innerHTML = '<p class="adm-nota">Quem entra por convite começa sem obras. Atribua as obras depois que a conta for criada.</p>'; return; }
      box.innerHTML = `<span class="label">Obras e serviços atribuídos</span>${tecnico ? '<p class="adm-nota">O técnico acessa somente os itens selecionados.</p>' : `<div class="seg" role="group" aria-label="Obras">
        <button type="button" data-todas="1" aria-pressed="${st.todas}">Todas as obras</button><button type="button" data-todas="0" aria-pressed="${!st.todas}">Só algumas</button></div>`}
        <div class="adm-toggles col"${st.todas ? ' hidden' : ''}>${obras.length ? obras.map((o) => `<button type="button" class="chip-act" data-obra="${Number(o.id)}" aria-pressed="${st.obras.includes(Number(o.id))}">${icon('check', 16)}<span>${esc(o.codigo)} · ${esc(o.nome)}</span></button>`).join('') : '<p class="adm-nota">Nenhuma obra cadastrada.</p>'}</div>
        ${!st.todas && !st.obras.length ? '<p class="adm-nota warn-txt">Sem nenhuma obra, a pessoa não vê nada até receber uma.</p>' : ''}`;
    };
    const pintar = () => { pintarObras(); CC.$('#uf-pode', el).innerHTML = oQuePode(st.papel, dados); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.app) {
        st.apps = st.apps.includes(b.dataset.app) ? st.apps.filter((a) => a !== b.dataset.app) : [...st.apps, b.dataset.app];
        b.setAttribute('aria-pressed', String(st.apps.includes(b.dataset.app)));
      } else if (b.dataset.obra) {
        const o = Number(b.dataset.obra);
        st.obras = st.obras.includes(o) ? st.obras.filter((x) => x !== o) : [...st.obras, o];
        pintarObras();
      } else if (b.dataset.todas) {
        st.todas = b.dataset.todas === '1';
        pintarObras();
      } else if (b.dataset.metodo) {
        st.metodo = b.dataset.metodo;
        CC.$$('[data-metodo]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        CC.$('#uf-senha-box', el).hidden = st.metodo !== 'senha';
        CC.$('#uf-nome-box', el).hidden = st.metodo !== 'senha';
        CC.$('#uf-salvar span', el).textContent = st.metodo === 'senha' ? 'Criar usuário' : 'Enviar convite';
        pintarObras();
      }
    });
    CC.$('#uf-papel', el).addEventListener('change', (e) => { st.papel = e.target.value; pintar(); });
    const gerar = CC.$('#uf-gerar', el);
    if (gerar) gerar.addEventListener('click', () => { CC.$('#uf-senha', el).value = gerarSenha(); });
    pintar();

    const salvar = CC.$('#uf-salvar', el);
    salvar.addEventListener('click', async () => {
      const nome = editando ? '' : CC.$('#uf-nome', el).value.trim();
      const email = editando ? '' : CC.$('#uf-email', el).value.trim().toLowerCase();
      const senha = editando ? '' : CC.$('#uf-senha', el).value;
      if (!editando && st.metodo === 'senha' && !nome) return erro('Informe o nome.');
      if (!editando && !EMAIL.test(email)) return erro('Informe um e-mail válido.');
      if (!editando && st.metodo === 'senha' && senha.length < 10) return erro('A senha provisória precisa ter pelo menos 10 caracteres.');
      if (!st.apps.length) return erro('Escolha ao menos um app.');
      erro('');
      const obrasCorpo = st.papel === 'tecnico' ? st.obras : X.ESCOPADOS.includes(st.papel) ? (st.todas ? 'todas' : st.obras) : 'todas';
      const rotulo = salvar.innerHTML;
      CC.busy(salvar, 'Salvando…');
      try {
        if (editando) {
          await CC.api(`/usuarios/${id}/acesso`, { method: 'PUT', body: { suiteRole: st.papel, apps: st.apps, obras: obrasCorpo } });
          CC.toast('Acesso atualizado');
          return CC.go('usuarios');
        }
        if (st.metodo === 'senha') {
          await CC.api('/usuarios', { method: 'POST', body: { nome, email, senha, suiteRole: st.papel, apps: st.apps, obras: obrasCorpo } });
          const page = sucesso(el, 'Usuário criado', `${nome} já pode entrar com a senha provisória.`,
            `<div class="card"><span class="label">Senha provisória</span><b class="adm-senha">${esc(senha)}</b>
              <button class="btn2" type="button" id="uf-copiar" style="width:100%;margin-top:10px">${icon('copy', 18)}Copiar senha</button></div>`);
          CC.$('#uf-copiar', page).addEventListener('click', () => { (navigator.clipboard ? navigator.clipboard.writeText(senha) : Promise.reject()).then(() => CC.toast('Senha copiada')).catch(() => CC.toast('Não foi possível copiar. Anote a senha.', 'warning-circle')); });
          return undefined;
        }
        const { data } = await CC.api('/cadastros/convites', { method: 'POST', body: { email, papel: st.papel, apps: st.apps } });
        sucesso(el, 'Convite enviado', `Enviamos o convite para ${email} como ${X.nomePapel(st.papel)}.`,
          data && data.code ? `<div class="card"><span class="label">Código da empresa</span><b class="adm-senha">${esc(data.code)}</b></div>` : '');
      } catch (error) {
        salvar.disabled = false;
        salvar.innerHTML = rotulo;
        erro(A.erroTexto(error, 'Salvar'));
      }
      return undefined;
    });
    return undefined;
  };
})(window.CC = window.CC || {});
