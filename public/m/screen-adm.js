// Administracao no celular: pecas comuns das telas (topo, permissao, baixar arquivo), a secao
// "Administracao" do Menu, o "Ver o sistema como" (so visual, como no desktop) e o diagnostico
// simples do aparelho que vai junto com o report. O servidor confere todas as permissoes de novo.
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm = CC.adm || {};
  const CHAVE_COMO = 'cc_m_como';

  A.plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
  // "26/09/2026 08:12" no horario de Brasilia.
  A.quando = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(', ', ' ');
  };
  A.dia = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };
  A.iniciais = (nome) => String(nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
  A.papelReal = () => String((CC.session.user() || {}).role || '');
  A.erroTexto = (error, oQue) => (error && error.status === 0 ? `Sem internet. ${oQue || 'Esta ação'} precisa da conexão.` : (error && error.message) || 'Não foi possível concluir agora.');

  // Topo das telas internas: voltar, titulo e (opcional) um botao a direita.
  A.top = (titulo, sub, direita) => `<div class="top"><button class="back" type="button" id="voltar" aria-label="Voltar">${icon('caret-left', 20)}</button>
    <span class="grow"><h1>${esc(titulo)}</h1>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</span>${direita || ''}</div>`;
  A.voltar = (el, destino) => {
    const b = CC.$('#voltar', el);
    if (b) b.addEventListener('click', () => (Array.isArray(destino) ? CC.go(destino[0], destino[1]) : CC.go(destino || 'menu')));
  };

  A.can = (p) => (CC.sv ? CC.sv.can(p) : false);
  // Confere a permissao antes de abrir a tela. Sem ela, mostra o aviso e devolve false.
  A.guard = async function (params, perm, titulo) {
    if (CC.sv) await CC.sv.loadPerms();
    if (!perm || A.can(perm)) return true;
    const el = CC.render(`${A.top(titulo)}<div class="empty">${icon('lock-simple', 28)}<b>Sem permissão</b>Seu papel não abre esta tela. Fale com um administrador.</div>`, true, params);
    A.voltar(el);
    return false;
  };

  // Botao que pede um segundo toque antes de agir. Devolve true quando ja estava armado.
  A.armado = (botao, texto) => {
    if (botao.dataset.armed === '1') return true;
    botao.dataset.armed = '1';
    const alvo = botao.querySelector('span') || botao;
    alvo.textContent = texto || 'Toque de novo para confirmar';
    return false;
  };

  // Baixa um arquivo da API com o token: compartilhar do aparelho ou download.
  A.baixar = async function (path, nome) {
    const r = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${CC.session.token()}` }, cache: 'no-store' }).catch(() => null);
    if (!r) return CC.toast('Sem internet. Baixar o arquivo precisa da conexão.', 'wifi-slash');
    if (!r.ok) return CC.toast((await r.json().catch(() => ({}))).erro || 'Não foi possível gerar o arquivo agora.', 'warning-circle');
    const blob = await r.blob();
    const file = new File([blob], nome, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nome }); } catch { /* cancelado */ }
      return undefined;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return undefined;
  };

  // ---- "Ver o sistema como": troca so o que o celular mostra; o servidor segue com o papel real.
  const lerComo = () => { try { return JSON.parse(sessionStorage.getItem(CHAVE_COMO) || 'null'); } catch { return null; } };
  let realCan = null, realAdmin = null;
  A.como = () => {
    const c = lerComo();
    if (!c || !c.papel) return null;
    const pode = realCan ? realCan('p9') : A.papelReal() === 'admin';
    return pode ? c : null;
  };
  A.simular = (papel, permissoes) => {
    try {
      if (papel && papel !== 'admin') sessionStorage.setItem(CHAVE_COMO, JSON.stringify({ papel, permissoes: permissoes || [] }));
      else sessionStorage.removeItem(CHAVE_COMO);
    } catch { /* sem armazenamento: nao simula */ }
    location.hash = '#home';
    location.reload();
  };
  function embrulhar() {
    if (CC.sv && !realCan) {
      realCan = CC.sv.can;
      CC.sv.can = (p) => { const c = A.como(); return c ? (c.permissoes || []).includes(p) : realCan(p); };
    }
    if (CC.isAdmin && !realAdmin) {
      realAdmin = CC.isAdmin;
      CC.isAdmin = () => (A.como() ? false : realAdmin());
    }
  }
  function faixaComo() {
    embrulhar();
    const c = A.como();
    if (!c || document.getElementById('adm-como')) return;
    const nome = (CC.usu && CC.usu.nomePapel) ? CC.usu.nomePapel(c.papel) : c.papel;
    const faixa = document.createElement('div');
    faixa.id = 'adm-como';
    faixa.className = 'adm-como';
    faixa.setAttribute('role', 'status');
    faixa.innerHTML = `${icon('eye-slash', 16)}<span>Vendo como <b>${esc(nome)}</b>. Só muda o que aparece.</span><button type="button">Voltar</button>`;
    CC.$('button', faixa).addEventListener('click', () => A.simular(''));
    document.body.appendChild(faixa);
  }

  // ---- Diagnostico simples do aparelho (vai no report, se a pessoa deixar ligado).
  const LIMITE = 20;
  const acoes = [];
  let telaVista = '';
  A.TELAS = {
    home: 'Início', obras: 'Obras', obra: 'Detalhe da obra', 'obra-editar': 'Editar obra', servico: 'Serviço', lancar: 'Lançar', ok: 'Lançar',
    lancamentos: 'Lançamentos', lanc: 'Detalhe do lançamento', menu: 'Menu', perfil: 'Meu perfil', pedidos: 'Pedidos de acesso',
    descartadas: 'Obras descartadas', atualizacao: 'Atualização do aplicativo', fechamento: 'Fechamento mensal', historico: 'Histórico',
    usuarios: 'Usuários', 'usuario-form': 'Usuários', papeis: 'Papéis e permissões', 'emails-ext': 'E-mails externos', sistema: 'Sistema',
  };
  A.ultimaTela = '';
  const registrar = (texto) => {
    acoes.push({ quando: new Date().toISOString(), acao: String(texto).slice(0, 80) });
    if (acoes.length > LIMITE) acoes.shift();
  };
  const olharTela = () => {
    const atual = CC.current ? CC.current() : '';
    if (atual && atual !== telaVista) {
      telaVista = atual;
      registrar(`Abriu ${A.TELAS[atual] || 'uma tela'}`);
      if (A.TELAS[atual] && !['reports', 'report'].includes(atual)) A.ultimaTela = A.TELAS[atual];
    }
  };
  // Rotulo de botao serve de acao; com numero (pode ser valor) fica de fora.
  const rotuloSeguro = (el) => {
    const bruto = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return bruto && bruto.length <= 40 && !/\d/.test(bruto) ? bruto : '';
  };
  document.addEventListener('click', (event) => {
    olharTela();
    const alvo = event.target.closest && event.target.closest('button');
    const rotulo = alvo ? rotuloSeguro(alvo) : '';
    if (rotulo) registrar(`Tocou em ${rotulo}`);
  }, true);
  window.addEventListener('offline', () => registrar('A conexão caiu'));
  window.addEventListener('online', () => registrar('A conexão voltou'));

  function navegador() {
    const ua = navigator.userAgent || '';
    const app = ua.match(/SuiteConstrutec\/(\S+)/);
    const achou = [['EdgA/', 'Edge'], ['Edg/', 'Edge'], ['Firefox/', 'Firefox'], ['CriOS/', 'Chrome'], ['Chrome/', 'Chrome'], ['Version/', 'Safari']].find(([m]) => ua.includes(m));
    const versao = achou ? (ua.split(achou[0])[1] || '').split(/[. ]/)[0] : '';
    const sistema = /Android/.test(ua) ? 'Android' : (/iPhone|iPad/.test(ua) ? 'iOS' : (/Windows/.test(ua) ? 'Windows' : (/Mac OS X/.test(ua) ? 'macOS' : '')));
    return [app ? `App Suíte ${app[1]}` : '', achou ? `${achou[1]} ${versao}` : 'Navegador', sistema].filter(Boolean).join(' · ');
  }
  A.diag = () => {
    olharTela();
    const tipo = navigator.connection && navigator.connection.effectiveType;
    return {
      versao: '', // o servidor preenche com a versao do sistema
      navegador: navegador(),
      conexao: navigator.onLine === false ? 'offline' : (tipo ? `online · ${tipo}` : 'online'),
      idioma: navigator.language || '',
      resolucao: `${window.innerWidth}x${window.innerHeight}`,
      acoes: acoes.slice(-LIMITE),
    };
  };
  A.diagResumo = (d) => [d.versao ? `versão ${d.versao}` : '', d.navegador || '', d.conexao ? d.conexao.split(' · ')[0] : '', d.resolucao || ''].filter(Boolean).join(', ');

  // ---- Secao "Administracao" do Menu: cada item so para quem tem a permissao (igual ao desktop).
  const ITENS = [
    ['fechamento', 'p8', 'lock-simple', 'Fechamento mensal', 'Checklist do mês, fechar e reabrir competências'],
    ['usuarios', 'p9', 'user-plus', 'Usuários', 'Acessos, papéis, convites e pedidos de acesso'],
    ['historico', 'p9', 'list-checks', 'Histórico', 'Quem mudou o quê, quando e de onde'],
    ['reports', null, 'bug', 'Reports', 'Problemas e sugestões enviados à equipe do sistema'],
    ['sistema', 'p9', 'info', 'Sistema', 'Versão, servidor, banco de dados e backup'],
  ];
  const itensVisiveis = () => ITENS.filter(([k, p]) => CC.screens[k] && (!p || A.can(p)));
  function secao() {
    const itens = itensVisiveis();
    const adm = itens.some(([, p]) => p);
    return `${adm ? '<p class="adm-sec">Administração</p>' : ''}${itens.map(([k, , ic, t, s]) => `<button class="menu-item" type="button" data-adm="${k}">${icon(ic, 22)}<span>${esc(t)}<small>${esc(s)}</small></span></button>`).join('')}`;
  }
  A.menuHtml = () => `<div id="m-adm" class="adm-menu">${secao()}</div>`;
  A.wireMenu = function (el) {
    const box = CC.$('#m-adm', el);
    if (!box) return;
    const ligar = () => CC.$$('[data-adm]', box).forEach((b) => b.addEventListener('click', () => CC.go(b.dataset.adm)));
    ligar();
    if (!CC.sv) return;
    const antes = box.innerHTML;
    CC.sv.loadPerms().then(() => {
      if (!box.isConnected) return;
      const agora = secao();
      if (agora !== antes) { box.innerHTML = agora; ligar(); }
    });
  };

  embrulhar();
  document.addEventListener('DOMContentLoaded', faixaComo);
})(window.CC = window.CC || {});
