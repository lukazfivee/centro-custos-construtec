// Configuracoes, aba "Dev": contas, sessoes abertas e auditoria das acoes do dev. So aparece para o dev.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const { esc } = CC;
  const C = D.cfg = D.cfg || {};
  const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

  const ACOES = {
    senha_trocada: 'Senha trocada', conta_ativada: 'Conta ativada', conta_desativada: 'Conta desativada', conta_excluida: 'Conta excluída',
    papel_alterado: 'Papel alterado', permissao_alterada: 'Permissão alterada', permissoes_restauradas: 'Permissões restauradas',
    sessoes_derrubadas: 'Sessões derrubadas', login_desbloqueado: 'Login desbloqueado', ver_como_inicio: 'Ver como: início', ver_como_fim: 'Ver como: fim',
  };
  const detalhe = (d) => (d ? Object.entries(d).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ') : '');
  const acao = (rotulo, nome, email) => `<button type="button" class="btn btn-s" data-dev-acao="${nome}" data-email="${esc(email)}">${esc(rotulo)}</button>`;

  function contas(lista, eu) {
    const linhas = lista.filter((u) => u.suiteRole !== 'dev' && u.email !== eu.email).map((u) => ({
      celulas: [esc(u.nome || u.name || u.email), esc(u.email), esc(D.usu.nomePapel(u.suiteRole)),
        u.ativo === false ? U.chip('Desativada', 'neutro') : U.chip('Ativa', 'ok'),
        `<div class="cfg-acoes">${acao('Ver como', 'ver', u.email)}${acao('Desbloquear login', 'desbloquear', u.email)}${acao('Derrubar sessões', 'derrubar', u.email)}</div>`],
    }));
    return U.tabela({ colunas: [{ rotulo: 'Nome' }, { rotulo: 'E-mail' }, { rotulo: 'Papel' }, { rotulo: 'Situação' }, { rotulo: 'Ações' }], linhas, vazio: 'Nenhuma outra conta.' });
  }

  function sessoes(lista) {
    const linhas = lista.map((s) => ({
      celulas: [esc(s.name), esc(s.email), esc(s.instanceName || 'Navegador ou app'), esc(quando(s.lastSeenAt)),
        s.viewAs ? U.chip('Ver como', 'aviso', 'eye') : (s.current ? U.chip('Esta sessão', 'ok') : '')],
    }));
    return U.tabela({ colunas: [{ rotulo: 'Nome' }, { rotulo: 'E-mail' }, { rotulo: 'Origem' }, { rotulo: 'Última atividade' }, { rotulo: '' }], linhas, vazio: 'Nenhuma sessão aberta.' });
  }

  function auditoria(lista) {
    const linhas = lista.map((e) => ({
      celulas: [esc(quando(e.createdAt)), esc(e.actorEmail), esc(ACOES[e.action] || e.action), esc(e.targetEmail || ''), esc(detalhe(e.detail))],
    }));
    return U.tabela({ colunas: [{ rotulo: 'Quando' }, { rotulo: 'Quem' }, { rotulo: 'Ação' }, { rotulo: 'Conta' }, { rotulo: 'Detalhe' }], linhas, vazio: 'Nenhuma ação registrada ainda.' });
  }

  const TEXTOS = {
    ver: { titulo: 'Ver como esta pessoa?', texto: 'Você entra na conta dela por 30 minutos. Tudo o que fizer vale como ela e fica registrado.', ok: 'Ver como', tom: 'aviso', icone: 'eye' },
    derrubar: { titulo: 'Derrubar as sessões?', texto: 'A pessoa sai de todos os aparelhos e entra de novo com a senha.', ok: 'Derrubar', tom: 'aviso' },
  };

  async function executar(nome, email, corpo, vivo) {
    if (TEXTOS[nome] && !(await D.confirmar(TEXTOS[nome]))) return;
    if (nome === 'ver') return D.verComo.abrir(email);
    const rota = nome === 'derrubar' ? '/dev/sessoes/derrubar' : '/dev/usuarios/desbloquear';
    const { data } = await CC.api(rota, { method: 'POST', body: { email } });
    CC.toast(nome === 'derrubar' ? `${data.revoked || 0} sessão(ões) derrubada(s)` : 'Login desbloqueado');
    return C.dev(corpo, vivo);
  }

  C.dev = async function (corpo, vivo) {
    corpo.innerHTML = U.carregando('Lendo as ferramentas de dev…');
    const [s, a, u] = await Promise.all([CC.api('/dev/sessoes'), CC.api('/dev/auditoria'), CC.api('/usuarios')]);
    if (!vivo()) return;
    const eu = D.usuario();
    corpo.innerHTML = `<div class="cfg-col">
      <section class="card cfg-card"><h2>Contas</h2><span class="cfg-nota">Contas de outro dev ficam de fora. A troca de senha fica em Usuários, ao editar a pessoa.</span>${contas(u.data, eu)}</section>
      <section class="card cfg-card"><h2>Sessões abertas</h2>${sessoes(s.data.sessions)}</section>
      <section class="card cfg-card"><h2>Auditoria do dev</h2><span class="cfg-nota">Últimas ações. Senhas nunca entram neste registro.</span>${auditoria(a.data.entries)}</section></div>`;
    CC.$$('[data-dev-acao]', corpo).forEach((b) => b.addEventListener('click', async () => {
      const volta = U.ocupar(b, b.textContent);
      try { await executar(b.dataset.devAcao, b.dataset.email, corpo, vivo); } catch (error) { CC.toast(error.message || 'Não foi possível concluir agora.'); }
      volta();
    }));
  };
})(window.CC);
