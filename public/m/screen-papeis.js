// Papeis e permissoes (matriz 6 papeis x 12 permissoes, um papel por vez no celular), e-mails externos
// autorizados e "Ver o sistema como". Mesmas rotas do desktop (public/d/telas/usuarios-papeis.js,
// usuarios-emails.js, usuarios-como.js). Sem conta corporativa a matriz vem so para consulta.
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm;
  let papelAberto = 'gestor';

  CC.screens.papeis = async function (params) {
    if (!(await A.guard(params, 'p9', 'Papéis e permissões'))) return;
    const X = CC.usu;
    const topo = A.top('Papéis e permissões', 'Vale para o celular e para o computador');
    A.voltar(CC.render(`${topo}<div class="skeleton"></div>`, true, params), 'usuarios');
    let dados, usuarios;
    try {
      [dados, usuarios] = await Promise.all([X.matriz(true), CC.api('/usuarios').then((r) => X.lista(r.data)).catch(() => [])]);
    } catch (error) {
      return CC.errorScreen(document.getElementById('view'), error, () => CC.screens.papeis(params));
    }
    const conta = {};
    usuarios.forEach((u) => { if (u.ativo !== false) conta[u.suiteRole] = (conta[u.suiteRole] || 0) + 1; });
    const pintar = () => {
      const p = papelAberto;
      const fixo = p === 'admin';
      const so = !!dados.somenteLeitura;
      const linhas = X.GRUPOS.map(([grupo, itens]) => `<p class="sheet-sec">${esc(grupo)}</p><div class="card adm-lista">${itens.map(([id, nome, nota]) => {
        const on = fixo || !!(dados.matriz[p] && dados.matriz[p][id]);
        return `<div class="adm-row"><span class="grow"><b>${esc(nome)}</b><small>${esc(nota)}</small></span>
          ${fixo ? `<span class="adm-sw on fixo" aria-label="${esc(nome)}: sempre liberado">${icon('lock-simple', 14)}</span>`
            : `<button type="button" class="adm-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(nome)}" data-perm="${id}"${so ? ' disabled' : ''}><span></span></button>`}</div>`;
      }).join('')}</div>`).join('');
      const el = CC.render(`${topo}
        <div class="chips" role="group" aria-label="Papel">${X.PAPEIS.map(([v, l]) => `<button class="chip-act" type="button" data-papel="${v}" aria-pressed="${v === p}">${esc(l)} · ${conta[v] || 0}</button>`).join('')}</div>
        <p class="adm-nota">${esc(so ? 'Sem conta corporativa, a matriz padrão é só para consulta.' : (fixo ? 'O administrador fica sempre com tudo e não pode ser alterado.' : 'Toque para ligar ou desligar. A mudança vale na hora para todos com este papel.'))}</p>
        ${linhas}
        <button class="btn2" type="button" id="pp-restaurar"${so ? ' disabled' : ''}>${icon('arrow-counter-clockwise', 18)}<span>Restaurar padrão</span></button>`, true, params);
      A.voltar(el, 'usuarios');
      CC.$$('[data-papel]', el).forEach((b) => b.addEventListener('click', () => { papelAberto = b.dataset.papel; pintar(); }));
      CC.$$('[data-perm]', el).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          dados = (await CC.api('/usuarios/permissoes', { method: 'POST', body: { papel: p, permissao: b.dataset.perm, permitido: b.getAttribute('aria-checked') !== 'true' } })).data;
          X.guardarMatriz(dados);
          if (params.__nav === CC.nav) pintar();
        } catch (error) { b.disabled = false; CC.toast(A.erroTexto(error, 'Salvar a permissão'), 'warning-circle'); }
      }));
      const rest = CC.$('#pp-restaurar', el);
      rest.addEventListener('click', async () => {
        if (!A.armado(rest, 'Desfaz todas as mudanças da matriz. Toque de novo')) return;
        rest.disabled = true;
        try {
          dados = (await CC.api('/usuarios/permissoes/restaurar', { method: 'POST', body: {} })).data;
          X.guardarMatriz(dados);
          CC.toast('Padrão restaurado');
        } catch (error) { CC.toast(A.erroTexto(error, 'Restaurar'), 'warning-circle'); }
        if (params.__nav === CC.nav) pintar();
      });
    };
    pintar();
    return undefined;
  };

  const tituloEmail = (item) => (typeof item === 'string' ? item : String((item && item.email) || ''));

  CC.screens['emails-ext'] = async function (params) {
    if (!(await A.guard(params, 'p9', 'E-mails externos'))) return;
    const topo = A.top('E-mails externos', 'Fora da empresa, autorizados a criar conta');
    A.voltar(CC.render(`${topo}<div class="skeleton"></div>`, true, params), 'usuarios');
    let data;
    try { data = (await CC.api('/usuarios/emails-autorizados/lista')).data; } catch (error) {
      return CC.errorScreen(document.getElementById('view'), error, () => CC.screens['emails-ext'](params));
    }
    if (!data.disponivel) {
      return A.voltar(CC.render(`${topo}<div class="empty">${icon('info', 28)}E-mails externos são administrados apenas com uma conta corporativa.</div>`, true, params), 'usuarios');
    }
    const emails = Array.isArray(data.emails) ? data.emails : [];
    const el = CC.render(`${topo}
      <div class="card"><label class="field"><span>E-mail</span><input id="ee-email" type="email" inputmode="email" autocomplete="off" maxlength="200" placeholder="nome@empresa.com.br"></label>
        <label class="field" style="margin-top:10px"><span>Observação (opcional)</span><input id="ee-obs" maxlength="200" autocomplete="off" placeholder="Ex.: engenheiro terceirizado"></label>
        <p class="alert" role="alert" id="ee-erro"></p>
        <button class="btn" type="button" id="ee-autorizar" style="width:100%;margin-top:10px">${icon('plus', 18)}Autorizar e-mail</button></div>
      <p class="sheet-sec">Autorizados · ${emails.length}</p>
      ${emails.length ? `<div class="card adm-lista">${emails.map((i) => `<div class="adm-row"><span class="grow"><b>${esc(tituloEmail(i))}</b>${i && i.note ? `<small>${esc(i.note)}</small>` : ''}</span>
        <button class="chip-act" type="button" data-revogar="${esc(tituloEmail(i))}"><span>Revogar</span></button></div>`).join('')}</div>`
        : `<div class="empty">${icon('envelope-simple', 28)}Nenhum e-mail externo autorizado.</div>`}`, true, params);
    A.voltar(el, 'usuarios');
    const again = () => { if (params.__nav === CC.nav) CC.screens['emails-ext'](params).catch(() => {}); };
    const aut = CC.$('#ee-autorizar', el);
    aut.addEventListener('click', async () => {
      const email = CC.$('#ee-email', el).value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { CC.$('#ee-erro', el).textContent = 'Informe um e-mail válido.'; return; }
      CC.busy(aut, 'Autorizando…');
      try { await CC.api('/usuarios/emails-autorizados', { method: 'POST', body: { email, observacao: CC.$('#ee-obs', el).value.trim() } }); CC.toast('E-mail autorizado'); }
      catch (error) { CC.toast(A.erroTexto(error, 'Autorizar'), 'warning-circle'); }
      again();
    });
    CC.$$('[data-revogar]', el).forEach((b) => b.addEventListener('click', async () => {
      if (!A.armado(b, 'Toque de novo')) return;
      b.disabled = true;
      try { await CC.api('/usuarios/emails-autorizados/revogar', { method: 'POST', body: { email: b.dataset.revogar } }); CC.toast('Autorização revogada'); }
      catch (error) { CC.toast(A.erroTexto(error, 'Revogar'), 'warning-circle'); }
      again();
    }));
    return undefined;
  };

  // "Ver o sistema como": escolhe o papel; o celular recarrega mostrando so o que ele ve.
  CC.usu = CC.usu || {};
  CC.usu.comoSheet = function () {
    const X = CC.usu;
    const atual = (A.como() || {}).papel || 'admin';
    const sh = CC.sheet('adm-como-sh', `${CC.sheetHead('eye-slash', 'Ver o sistema como')}
      <p class="od-txt">Menus e botões sem permissão somem neste celular. O servidor continua usando o seu papel real; para voltar, toque em Voltar na faixa de baixo.</p>
      ${X.PAPEIS.map(([v, l, n]) => `<button type="button" class="suite-item om-item${v === atual ? ' current' : ''}" data-como="${v}">${icon(v === atual ? 'check-circle' : 'user-plus', 22)}<span><b>${esc(l)}${v === 'admin' ? ' (eu)' : ''}</b><small>${esc(n)}</small></span></button>`).join('')}
      <div id="como-err"></div>`);
    CC.$$('[data-como]', sh.el).forEach((b) => b.addEventListener('click', async () => {
      const papel = b.dataset.como;
      if (papel === 'admin') return A.simular('');
      try {
        const d = await X.matriz();
        A.simular(papel, Object.keys(d.matriz[papel] || {}).filter((p) => d.matriz[papel][p]));
      } catch (error) { CC.$('#como-err', sh.el).innerHTML = CC.sheetErr(error); }
      return undefined;
    }));
  };
})(window.CC = window.CC || {});
