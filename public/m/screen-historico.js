// Historico (auditoria) no celular, so p9 como no desktop (public/d/telas/historico*.js): filtros por
// tipo, pessoa e periodo, busca, "carregar mais", detalhe com antes -> depois e CSV. So leitura.
// Rotas em routes/history.js (GET /historico, /historico/pessoas e /historico/exportar.csv).
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm;
  const POR_PAGINA = 30;
  const TIPOS = [['', 'Tudo'], ['lancamentos', 'Lançamentos'], ['cadastros', 'Cadastros'], ['cobrancas', 'Cobranças'], ['fechamento', 'Fechamento'], ['usuarios', 'Usuários']];
  const PERIODOS = [['', 'Todo o período'], ['hoje', 'Hoje'], ['7d', 'Últimos 7 dias'], ['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['custom', 'Escolher datas']];
  const ACOES = {
    criado: 'Criou', criada: 'Criou', atualizado: 'Editou', atualizada: 'Editou', alterada: 'Editou', excluido: 'Excluiu', excluida: 'Excluiu',
    estornado: 'Estornou', fechado: 'Fechou', reaberto: 'Reabriu', ativado: 'Ativou', desativado: 'Desativou', acesso_alterado: 'Permissão',
    descartada: 'Descartou', restaurada: 'Restaurou', gerados: 'Gerou', conciliada: 'Conciliou', importada: 'Importou',
  };
  const TOM = { Excluiu: 'warn', Descartou: 'warn', Estornou: 'warn', Reabriu: 'warn', Desativou: 'warn', Criou: 'ok', Fechou: 'ok', Ativou: 'ok' };
  const ORIGENS = { computador: 'Computador', celular: 'Celular', fila: 'Fila do celular' };
  const TIPO_NOME = { lancamento: 'lançamento', categoria: 'categoria', fornecedor: 'fornecedor', obra: 'obra', usuario: 'usuário', fechamento: 'fechamento', recorrente: 'recorrente', permissao: 'permissão', backup: 'backup' };
  const CAMPOS = {
    type: 'Tipo', costCenterId: 'Obra (código interno)', categoryId: 'Categoria (código interno)', description: 'Descrição', counterparty: 'Favorecido',
    amount: 'Valor', date: 'Competência', notes: 'Observação', dueDate: 'Vencimento', settlementDate: 'Liquidação', financialStatus: 'Situação',
    documentNumber: 'Documento', paymentMethod: 'Forma de pagamento', name: 'Nome', email: 'E-mail', role: 'Perfil', active: 'Ativo',
    motivo: 'Motivo', year: 'Ano', month: 'Mês', valor: 'Valor', dataEstorno: 'Data do estorno', color: 'Cor', revision: 'Revisão', id: 'Código',
  };
  const VALORES = { despesa: 'Despesa', receita: 'Receita', pendente: 'Pendente', liquidado: 'Liquidado', admin: 'Administrador', gestor: 'Gestor', supervisor: 'Supervisor' };

  const acao = (a) => ACOES[a] || (String(a || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
  const tipoNome = (t) => TIPO_NOME[t] || String(t || '').replace(/_/g, ' ');
  const campo = (k) => CAMPOS[k] || String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  function valor(k, v) {
    if (v == null || v === '') return '—';
    if (['amount', 'valor'].includes(k) && Number.isFinite(Number(v))) return CC.money(Number(v));
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 160);
    const t = String(v);
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(t)) return CC.dateFull(t.slice(0, 10));
    return VALORES[t] || t;
  }
  // Campos que mudaram. Sem "antes" (criacao ou registro antigo), lista o que foi gravado.
  function mudancas(item) {
    const depois = item.data && typeof item.data === 'object' && !Array.isArray(item.data) ? item.data : {};
    const antes = item.antes && typeof item.antes === 'object' ? item.antes : null;
    const chaves = antes ? [...new Set([...Object.keys(antes), ...Object.keys(depois)])] : Object.keys(depois);
    return chaves.filter((k) => !['id', 'revision'].includes(k)).map((k) => ({ k, campo: campo(k), antes: antes ? valor(k, antes[k]) : '—', depois: valor(k, depois[k]) }))
      .filter((m) => !(antes && String(m.antes) === String(m.depois)) && !(m.antes === '—' && m.depois === '—'));
  }
  function resumo(item) {
    const m = mudancas(item);
    if (!m.length) return '';
    if (item.antes) { const dois = m.slice(0, 2).map((x) => `${x.campo}: ${x.antes} para ${x.depois}`).join(' · '); return m.length > 2 ? `${dois} · +${m.length - 2}` : dois; }
    const motivo = m.find((x) => x.k === 'motivo');
    return motivo ? `Motivo: ${motivo.depois}` : '';
  }

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function periodo(k) {
    const h = new Date();
    if (k === 'hoje') return { de: iso(h), ate: iso(h) };
    if (k === '7d') return { de: iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 6)), ate: iso(h) };
    if (k === 'mes') return { de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(h) };
    if (k === 'mes_ant') return { de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
    return { de: '', ate: '' };
  }
  const query = (f, pagina) => {
    const q = new URLSearchParams();
    if (pagina) { q.set('pagina', String(pagina)); q.set('limite', String(POR_PAGINA)); }
    ['tipo', 'usuario', 'de', 'ate', 'busca'].forEach((k) => { if (f[k]) q.set(k, f[k]); });
    return q.toString();
  };

  let pessoas = null, pessoasDono = '';
  let memo = { key: '', rows: [], total: 0, pagina: 0 };

  function linha(item, i) {
    const a = acao(item.acao);
    const det = resumo(item);
    const hora = new Date(item.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    return `<button class="adm-row" type="button" data-i="${i}"><span class="grow"><b>${esc(item.resumo || tipoNome(item.tipo))}</b>
      <small>${esc([item.usuario || 'Sistema', hora, ORIGENS[item.origem] || 'Computador'].join(' · '))}</small>${det ? `<small class="adm-det">${esc(det)}</small>` : ''}</span>
      <span class="tag${TOM[a] ? ` ${TOM[a]}` : ''}">${esc(a)}</span></button>`;
  }

  function detalhe(item, f) {
    const a = acao(item.acao);
    const m = mudancas(item);
    const motivo = item.data && typeof item.data === 'object' ? item.data.motivo : '';
    const onde = [tipoNome(item.tipo), item.entity_id && String(item.entity_id).length <= 14 ? item.entity_id : ''].filter(Boolean).join(' · ');
    const kv = (k, v) => (v ? `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : '');
    const sh = CC.sheet('adm-hist', `${CC.sheetHead('list-checks', `${a} · ${item.resumo || tipoNome(item.tipo)}`)}
      <div class="card">${kv('Quando', A.quando(item.created_at))}${kv('Quem', item.usuario || 'Sistema')}${kv('Ação', a)}${kv('Onde', onde)}${kv('Origem', ORIGENS[item.origem] || 'Computador')}${kv('Motivo', motivo)}</div>
      <p class="sheet-sec">${item.antes ? 'Antes e depois' : 'O que foi gravado'}</p>
      ${m.length ? `<div class="card adm-diff">${m.map((x) => `<div class="adm-diff-row"><span class="label">${esc(x.campo)}</span>
        ${item.antes ? `<span class="adm-antes">${esc(x.antes)}</span>${icon('arrow-right', 14)}` : ''}<b>${esc(x.depois)}</b></div>`).join('')}</div>`
        : `<p class="adm-nota">${icon('info', 14)}${item.antes ? 'Nenhum campo mudou nesta ação.' : 'Esta ação não guardou o detalhe dos campos.'}</p>`}
      <p class="adm-nota">${icon('shield-check', 14)}O histórico não pode ser editado nem apagado, nem por administrador.</p>
      ${item.lancamento_id && CC.screens.lanc ? `<button class="btn" type="button" id="hs-lanc" style="width:100%;margin-top:12px">${icon('receipt', 18)}Abrir lançamento</button>` : ''}`);
    const b = CC.$('#hs-lanc', sh.el);
    if (b) b.addEventListener('click', () => { sh.close(); CC.go('lanc', { id: item.lancamento_id, from: ['historico', f] }); });
  }

  CC.screens.historico = async function (params) {
    if (!(await A.guard(params, 'p9', 'Histórico'))) return;
    const f = { tipo: '', usuario: '', periodo: '', de: '', ate: '', busca: '', ...(params || {}) };
    delete f.__nav;
    const key = JSON.stringify([f.tipo, f.usuario, f.de, f.ate, f.busca]);
    const go = (mudar) => CC.screens.historico({ ...f, ...mudar });
    if (!pessoas || pessoasDono !== CC.owner()) {
      try { pessoas = (await CC.api('/historico/pessoas')).data || []; pessoasDono = CC.owner(); } catch { pessoas = []; }
    }
    const sel = (id, opcoes, atual, rotulo) => `<label class="field"><span>${esc(rotulo)}</span><select id="${id}">${opcoes.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(atual) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const topo = A.top('Histórico', 'Quem mudou o quê, quando e de onde', `<button class="back" type="button" id="hs-csv" aria-label="Exportar CSV">${icon('download-simple', 22)}</button>`);
    const filtros = `<label class="field busca"><span class="sr">Buscar</span>${icon('magnifying-glass', 18)}<input id="hs-busca" type="search" enterkeyhint="search" autocomplete="off" value="${esc(f.busca)}" placeholder="Registro, detalhe ou usuário"></label>
      <div class="chips" role="group" aria-label="Tipo de registro">${TIPOS.map(([k, l]) => `<button class="chip-act" type="button" data-t="${k}" aria-pressed="${k === f.tipo}">${l}</button>`).join('')}</div>
      <div class="grid2">${sel('hs-pessoa', [['', 'Todas as pessoas'], ...pessoas.map((p) => [String(p.id), p.nome || 'Sem nome'])], f.usuario, 'Pessoa')}${sel('hs-periodo', PERIODOS, f.periodo, 'Período')}</div>
      ${f.periodo === 'custom' ? `<div class="grid2"><label class="field"><span>De</span><input type="date" id="hs-de" value="${esc(f.de)}"></label><label class="field"><span>Até</span><input type="date" id="hs-ate" value="${esc(f.ate)}"></label></div>` : ''}`;
    const wire = (el) => {
      A.voltar(el);
      CC.$('#hs-csv', el).addEventListener('click', () => A.baixar(`/historico/exportar.csv?${query(f, 0)}`, 'historico.csv'));
      CC.$$('[data-t]', el).forEach((b) => b.addEventListener('click', () => go({ tipo: b.dataset.t })));
      CC.$('#hs-pessoa', el).addEventListener('change', (e) => go({ usuario: e.target.value }));
      CC.$('#hs-periodo', el).addEventListener('change', (e) => go({ periodo: e.target.value, ...(e.target.value === 'custom' ? {} : periodo(e.target.value)) }));
      ['de', 'ate'].forEach((k) => { const i = CC.$(`#hs-${k}`, el); if (i) i.addEventListener('change', () => go({ [k]: i.value })); });
      const busca = CC.$('#hs-busca', el);
      busca.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); busca.blur(); go({ busca: busca.value.trim() }); } });
      busca.addEventListener('search', () => { if (busca.value.trim() !== f.busca) go({ busca: busca.value.trim() }); });
    };
    wire(CC.render(`${topo}${filtros}<div class="skeleton"></div>`, true, params));
    let data;
    try { data = (await CC.api(`/historico?${query(f, 1)}`)).data; } catch (error) {
      const el = CC.render(`${topo}${filtros}<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 28)}${esc(A.erroTexto(error, 'O histórico'))}</div>`, true, params);
      return wire(el);
    }
    memo = { key, rows: data.itens || [], total: Number(data.paginacao && data.paginacao.total) || 0, pagina: 1 };
    const pintar = () => {
      let dia = '';
      const lista = memo.rows.map((item, i) => {
        const d = A.dia(item.created_at);
        const head = d !== dia ? `<div class="group">${esc(d)}</div>` : '';
        dia = d;
        return head + linha(item, i);
      }).join('');
      const resto = memo.total - memo.rows.length;
      const el = CC.render(`${topo}${filtros}<p class="sub adm-sub">${A.plural(memo.total, 'registro', 'registros')}</p>
        ${lista ? `<div class="adm-lista solta">${lista}</div>` : `<div class="empty">${icon('list-checks', 28)}Nenhum registro com esses filtros.</div>`}
        ${resto > 0 ? `<button class="btn2" type="button" id="hs-mais">Carregar mais ${Math.min(resto, POR_PAGINA)} de ${resto}</button>` : ''}`, true, params);
      wire(el);
      CC.$$('[data-i]', el).forEach((b) => b.addEventListener('click', () => detalhe(memo.rows[Number(b.dataset.i)], f)));
      const mais = CC.$('#hs-mais', el);
      if (mais) mais.addEventListener('click', async () => {
        CC.busy(mais, 'Carregando…');
        try {
          const r = (await CC.api(`/historico?${query(f, memo.pagina + 1)}`)).data;
          if (memo.key !== key) return;
          memo.rows = memo.rows.concat(r.itens || []);
          memo.pagina += 1;
        } catch (error) { CC.toast(A.erroTexto(error, 'Carregar mais'), 'warning-circle'); }
        if (params.__nav !== CC.nav) return;
        const y = window.scrollY;
        pintar();
        window.scrollTo(0, y);
      });
    };
    pintar();
    return undefined;
  };
})(window.CC = window.CC || {});
