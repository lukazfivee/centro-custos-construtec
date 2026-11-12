// Sistema no celular (so p9, como a aba Sistema do desktop public/d/telas/config-sistema.js): versao,
// servidor, banco e registros. Backup: na nuvem o banco e PostgreSQL e as rotas de copia e restauracao
// respondem 501 (routes/backup.js so funciona com o banco local do app Windows); por isso aqui ele
// so e mostrado, e fazer ou restaurar copia fica no computador.
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm;
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const bytes = (n) => {
    const v = Number(n) || 0;
    const f = (x) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    if (v >= 1024 ** 3) return `${f(v / 1024 ** 3)} GB`;
    if (v >= 1024 ** 2) return `${f(v / 1024 ** 2)} MB`;
    return `${f(v / 1024)} KB`;
  };
  const duracao = (s) => {
    const m = Math.floor(Number(s || 0) / 60);
    if (m < 1) return 'agora há pouco';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} dias`;
  };
  const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;

  function backup(copias, s) {
    if (copias && copias.modo === 'local') {
      const r = copias.resumo || {};
      const auto = r.automatico || {};
      return `${kv('Cópias guardadas', `${num(r.total)} · ${bytes(r.bytes)}`)}${kv('Última cópia', r.ultima ? A.quando(r.ultima.modificadoEm) : 'Nenhuma ainda')}
        ${kv('Backup automático', auto.ativo ? `Ligado · a cada ${auto.intervaloHoras} h` : 'Desligado')}
        <p class="adm-nota">${icon('desktop', 14)}Fazer uma cópia agora, baixar ou restaurar é feito no computador onde o sistema está instalado (Configurações › Backup e restauração).</p>`;
    }
    return `${kv('Banco', 'PostgreSQL central')}${kv('Backup automático do sistema', s.backup && s.backup.automaticConfigured ? 'Ligado' : 'Pelo serviço do banco')}
      <p class="adm-nota">${icon('info', 14)}Nesta instalação em nuvem as cópias de segurança são feitas pelo serviço do banco central. Cópia e restauração por arquivo existem só no app do Windows com banco local.</p>`;
  }

  CC.screens.sistema = async function (params) {
    if (!(await A.guard(params, 'p9', 'Sistema'))) return;
    const topo = A.top('Sistema', 'Versão, servidor, banco e backup');
    A.voltar(CC.render(`${topo}<div class="skeleton"></div><div class="skeleton"></div>`, true, params));
    const inicio = performance.now();
    let s, saude, copias;
    try {
      [s, saude, copias] = await Promise.all([
        CC.api('/sistema/status').then((r) => r.data),
        fetch('/api/health', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        CC.api('/backup/copias').then((r) => r.data).catch(() => null),
      ]);
    } catch (error) {
      return CC.errorScreen(document.getElementById('view'), error, () => CC.screens.sistema(params));
    }
    const ms = saude ? Math.round(Number(saude.databaseLatencyMs || 0)) : Math.round(performance.now() - inicio);
    const a = s.application || {}, db = s.database || {}, r = db.records || {}, arm = db.storage || {};
    const modo = db.mode === 'postgres' ? 'PostgreSQL central' : 'Banco local (PGlite)';
    const app = (navigator.userAgent.match(/SuiteConstrutec\/(\S+)/) || [])[1];
    const el = CC.render(`${topo}
      <div class="card"><div class="adm-head"><span class="label">Sistema</span><span class="tag ok">${icon('check-circle', 12)}Operando normalmente</span></div>
        ${kv('Versão', `Centro de Custos v${a.version || ''}`)}${app ? kv('Aplicativo deste celular', `Suíte ${app}`) : ''}
        ${kv('Servidor', `Online · ${num(ms)} ms · ligado há ${duracao(a.uptimeSeconds)}`)}
        ${kv('Banco de dados', `${modo}${arm.sizeBytes != null ? ` · ${bytes(arm.sizeBytes)}` : ''}`)}
        ${kv('Lançamentos', num(r.activeTransactions))}${kv('Obras e fornecedores', `${num(r.costCenters)} obras · ${num(r.suppliers)} fornecedores`)}
        ${kv('Usuários ativos', num(r.activeUsers))}${r.pendingSyncConflicts ? kv('Conflitos de sincronização', num(r.pendingSyncConflicts)) : ''}
        ${kv('Fuso e moeda', `${(s.regional || {}).timezone || ''} · ${(s.regional || {}).currency || ''}`)}
        ${kv('Última migração', db.migrations && db.migrations.latest ? db.migrations.latest.filename.replace(/\.sql$/, '') : 'Nenhuma')}
        ${saude ? kv('Entrega de reports', saude.reportDeliveryConfigured ? 'Configurada' : 'Não configurada') : ''}</div>
      <div class="card"><span class="label">Backup</span>${backup(copias, s)}</div>
      ${CC.screens.reports ? `<button type="button" class="suite-item om-item" id="ss-rep">${icon('bug', 22)}<span><b>Reports</b><small>Algo não funcionou? Envie com o diagnóstico</small></span>${icon('caret-right', 18)}</button>` : ''}`, true, params);
    A.voltar(el);
    const rep = CC.$('#ss-rep', el);
    if (rep) rep.addEventListener('click', () => CC.go('reports'));
    return undefined;
  };
})(window.CC = window.CC || {});
