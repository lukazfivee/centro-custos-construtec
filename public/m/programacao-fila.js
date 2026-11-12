// Andamentos individuais usam a fila existente; cada evento conserva seu UUID e sua revisão.
(function (CC) {
  const F = CC.programacaoFila = {};
  F.estados = { pendente: 'A fazer', em_andamento: 'Em execução', pausado: 'Pausado', concluido: 'Concluído' };
  F.hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  F.sessao = () => {
    const owner = CC.owner(), token = CC.session.token();
    return () => !!token && owner === CC.owner() && token === CC.session.token();
  };
  F.meu = (a) => (a.participantes || []).find((p) => String(p.id) === String((CC.session.user() || {}).id) && p.ativo !== false);
  F.pode = (a) => CC.sv.role() === 'tecnico' && !!F.meu(a) && !a.cancelada && a.dia <= F.hoje();
  F.ops = async (id) => (await CC.queue.ops()).filter((i) => i.op === 'programacao' && Number(i.atividadeId) === Number(id)).sort((a, b) => a.criado_em - b.criado_em);
  async function prefixo() {
    const valid = F.sessao(), token = CC.session.token(), owner = CC.owner();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    if (!valid()) throw new CC.Stale();
    return `${owner}|programacao|${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}|`;
  }
  F.invalidarCache = async function (valid = F.sessao()) {
    const sessao = F.sessao(), cacheKey = await prefixo();
    const current = () => sessao() && valid();
    if (!current()) throw new CC.Stale();
    const saved = await CC.store.all('cache');
    if (!current()) throw new CC.Stale();
    for (const item of saved.filter((s) => s.key.startsWith(cacheKey))) {
      if (!current()) throw new CC.Stale();
      await CC.store.del('cache', item.key);
    }
    if (!current()) throw new CC.Stale();
  };
  F.cached = async function (key, route) {
    const valid = F.sessao(), cacheKey = await prefixo();
    try {
      const { data } = await CC.api(route);
      if (!valid()) throw new CC.Stale();
      if (data.dia && Array.isArray(data.atividades)) {
        const ids = new Set(data.atividades.map((a) => Number(a.id)));
        const saved = await CC.store.all('cache');
        if (!valid()) throw new CC.Stale();
        // A lista autoriza somente esta data; outras datas continuam disponíveis offline.
        await Promise.all(saved.filter((s) => s.key.startsWith(cacheKey) && s.data && s.data.id
          && s.data.dia === data.dia && !ids.has(Number(s.data.id))).map((s) => CC.store.del('cache', s.key)));
        if (!valid()) throw new CC.Stale();
      }
      await CC.store.put('cache', { key: cacheKey + key, data, at: Date.now() }).catch(() => {});
      if (!valid()) throw new CC.Stale();
      return { data, stale: false };
    } catch (error) {
      if (!valid()) throw new CC.Stale();
      if (error.status === 403 || error.status === 404) {
        await F.invalidarCache(valid);
      }
      if (error.status !== 0) throw error;
      const saved = await CC.store.get('cache', cacheKey + key).catch(() => null);
      if (!valid()) throw new CC.Stale();
      if (!saved) throw error;
      return { data: saved.data, stale: true, at: saved.at };
    }
  };
  F.overlay = async function (a) {
    const ops = await F.ops(a.id), meu = F.meu(a);
    const copy = { ...a, participantes: (a.participantes || []).map((p) => ({ ...p })), filaOps: ops };
    if (meu && ops.length) {
      const own = copy.participantes.find((p) => String(p.id) === String(meu.id));
      const last = ops[ops.length - 1];
      own.estado = last.body.estado;
      own.pendente = true;
    }
    return copy;
  };
  F.sendOp = async function (item) {
    const valid = F.sessao();
    if (!item.owner || item.owner !== CC.owner()) throw new CC.Stale();
    const { data } = await CC.api(`/programacao/${item.atividadeId}/atualizacoes`, { method: 'POST', body: item.body });
    if (!valid()) throw new CC.Stale();
    const prefix = await prefixo(), caches = await CC.store.all('cache').catch(() => []);
    if (!valid()) throw new CC.Stale();
    for (const cache of caches.filter((c) => c.key.startsWith(prefix))) {
      if (cache.data && Array.isArray(cache.data.atividades)) {
        cache.data.atividades = cache.data.atividades.map((a) => Number(a.id) === Number(data.id) ? data : a);
      } else if (Number((cache.data || {}).id) === Number(data.id)) cache.data = data;
      else continue;
      if (!valid()) throw new CC.Stale();
      await CC.store.put('cache', { ...cache, at: Date.now() }).catch(() => {});
    }
    if (!valid()) throw new CC.Stale();
    await CC.store.del('fila', item.client_id);
  };
  let saving = Promise.resolve();
  F.salvar = (a, estado, observacao) => {
    const valid = F.sessao();
    const save = async () => {
      if (!valid()) throw new CC.Stale();
      if (!F.pode(a)) throw new CC.ApiError(403, 'Esta atividade está disponível somente para consulta.');
      if (!F.estados[estado]) throw new CC.ApiError(400, 'Escolha um andamento válido.');
      const ops = await F.ops(a.id);
      if (!valid()) throw new CC.Stale();
      if (ops.some((i) => i.estado === 'erro')) throw new CC.ApiError(409, 'Revise os envios com erro antes de registrar outro andamento.');
      const revision = ops.length ? Math.max(F.meu(a).revision, ...ops.map((i) => Number(i.body.revision) + 1)) : F.meu(a).revision;
      const clientId = CC.uuid();
      await CC.queue.add({ client_id: clientId, op: 'programacao', atividadeId: a.id, obra_nome: a.centro.nome,
        body: { estado, observacao: String(observacao || '').trim(), revision, clientId } });
      if (!valid()) throw new CC.Stale();
      return F.ops(a.id);
    };
    const result = saving.then(save); saving = result.catch(() => {}); return result;
  };
})(window.CC = window.CC || {});
