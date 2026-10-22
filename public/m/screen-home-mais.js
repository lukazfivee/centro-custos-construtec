// Inicio completo no celular, abaixo das pendencias: filtro de mes e de obra, os 6 indicadores do mes,
// evolucao de 12 meses (SVG), despesas por categoria e atividades recentes. Mesmos dados do desktop
// (public/d/telas/inicio*.js): GET /dashboard/resumo?mes=&meses=12&centroId=. E os numeros da carteira de obras.
(function (CC) {
  const { esc, icon, money, moneyShort } = CC;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const filtro = { mes: '', obra: '' }; // fica na memoria enquanto o site esta aberto
  CC.homeQuery = (mes, obra) => `/dashboard/resumo?mes=${mes}&meses=12${obra ? `&centroId=${obra}` : ''}`;

  function topoEixo(max) {
    if (max <= 0) return 1000;
    const bruto = max / 4, pot = 10 ** Math.floor(Math.log10(bruto));
    return [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) * 4;
  }
  const curto = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v))));

  // Barras de receitas e despesas dos 12 meses, em 340 px de largura (texto do SVG em tamanho real).
  function grafico(tendencia) {
    const meses = (tendencia || []).slice(-12);
    const W = 340, H = 168, esq = 36, base = 144, alto = 132;
    const max = topoEixo(Math.max(0, ...meses.map((m) => Math.max(Number(m.receitas) || 0, Number(m.despesas) || 0))));
    const passo = (W - esq - 2) / Math.max(1, meses.length), larg = Math.max(3, Math.min(10, passo / 2 - 2));
    const grade = [0, 0.5, 1].map((p) => { const yy = base - p * alto; return `<line class="cs-grade" x1="${esq}" x2="${W}" y1="${yy}" y2="${yy}"></line><text class="cs-eixo" x="${esq - 5}" y="${yy + 3.5}" text-anchor="end">${esc(curto(max * p))}</text>`; }).join('');
    const barras = meses.map((m, i) => {
      const r = Number(m.receitas) || 0, d = Number(m.despesas) || 0;
      const x0 = esq + 2 + i * passo, x = x0 + (passo - (larg * 2 + 2)) / 2;
      const h1 = (r / max) * alto, h2 = (d / max) * alto;
      const nome = MES[Number(String(m.mes).slice(5, 7)) - 1] || '';
      const barra = (bx, h, cls) => (h > 0 ? `<rect class="${cls}" x="${bx.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${larg.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(2, h / 2).toFixed(1)}"></rect>` : '');
      return `${barra(x, h1, 'hp-rec')}${barra(x + larg + 2, h2, 'hp-desp')}
        <text class="cs-eixo" x="${(x0 + passo / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(nome)}</text>
        <rect class="cs-alvo" x="${x0.toFixed(1)}" y="0" width="${passo.toFixed(1)}" height="${base}"><title>${esc(`${nome}/${String(m.mes).slice(2, 4)} · receitas ${money(r)} · despesas ${money(d)}`)}</title></rect>`;
    }).join('');
    return `<svg class="cs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas pagas nos últimos 12 meses">${grade}${barras}</svg>`;
  }

  function medias(tendencia) {
    const meses = (tendencia || []).slice(-12), n = meses.length || 1;
    const r = meses.reduce((s, m) => s + (Number(m.receitas) || 0), 0) / n;
    const d = meses.reduce((s, m) => s + (Number(m.despesas) || 0), 0) / n;
    return `<span class="orc-nums"><span>Média de receitas <b>${esc(moneyShort(r))}</b></span><span>Média de despesas <b>${esc(moneyShort(d))}</b></span>
      <span>Margem média <b>${r > 0 ? `${Math.round(((r - d) / r) * 100)}%` : '—'}</b></span></span>`;
  }

  function categorias(lista) {
    const itens = (lista || []).filter((c) => c.tipo === 'despesa' && Number(c.total) > 0).slice(0, 8);
    if (!itens.length) return `<p class="sub mt-vazio">Nenhuma despesa neste mês.</p>`;
    const max = Math.max(...itens.map((c) => Number(c.total)));
    return itens.map((c) => `<div class="hp-cat"><span class="kv"><span>${esc(c.categoria)}</span><b>${esc(money(c.total))}</b></span>
      <span class="bar"><span style="width:${((Number(c.total) / max) * 100).toFixed(1)}%"></span></span></div>`).join('');
  }

  function kpis(r) {
    const res = Number(r.saldo) || 0, qv = Number(r.qtdVencidos) || 0;
    return CC.tiles([
      ['Recebido', moneyShort(r.receitas), `${r.qtdRecebidos || 0} receb.`],
      ['Pago', moneyShort(r.despesas), `${r.qtdPagos || 0} pagas`],
      ['Resultado', `${res < 0 ? '− ' : ''}${moneyShort(Math.abs(res))}`, 'recebido − pago', res < 0 ? 'warn-txt' : ''],
      ['A receber', moneyShort(r.aReceber), 'em aberto'],
      ['A pagar', moneyShort(r.aPagar), 'pendentes'],
      ['Vencidos', moneyShort(r.vencidos), qv ? `${qv} em atraso` : 'nenhum', qv ? 'warn-txt' : ''],
    ]);
  }

  // slot: elemento abaixo das pendencias; base: resumo do mes atual de todas as obras (ja carregado pelo Inicio).
  CC.homePainel = async function homePainel(slot, base, params) {
    const mesAtual = CC.month();
    if (!filtro.mes || filtro.mes > mesAtual) filtro.mes = mesAtual;
    const obras = (base.porCentro || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    if (filtro.obra && !obras.some((o) => String(o.id) === filtro.obra)) filtro.obra = '';
    const nomeObra = (obras.find((o) => String(o.id) === filtro.obra) || {}).nome;
    const filtros = `<span class="sec-tit hp-sec">Painel do mês</span>${CC.monthStep(filtro.mes)}
      <label class="field"><span class="sr">Obra</span><select id="hp-obra"><option value="">Todas as obras</option>${obras.map((o) => `<option value="${esc(o.id)}"${String(o.id) === filtro.obra ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></label>`;
    const ligar = () => {
      CC.$$('[data-mes]', slot).forEach((b) => b.addEventListener('click', () => { filtro.mes = b.dataset.mes; homePainel(slot, base, params); }));
      const sel = CC.$('#hp-obra', slot);
      if (sel) sel.addEventListener('change', () => { filtro.obra = sel.value; homePainel(slot, base, params); });
    };
    let r = base, stale = null;
    if (filtro.mes !== mesAtual || filtro.obra) {
      slot.innerHTML = `${filtros}<div class="skeleton"></div><div class="skeleton" style="height:180px"></div>`;
      ligar();
      try {
        const res = await CC.cached(`dash-${filtro.mes}-${filtro.obra}`, CC.homeQuery(filtro.mes, filtro.obra));
        r = res.data;
        stale = res.stale ? res : null;
      } catch (error) {
        if (!slot.isConnected || (params && params.__nav !== CC.nav)) return;
        slot.innerHTML = filtros;
        slot.insertAdjacentHTML('beforeend', `<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 24)}${esc(error.status === 0 ? 'Sem internet e sem dados salvos deste filtro.' : error.message)}</div>`);
        ligar();
        return;
      }
      if (!slot.isConnected || (params && params.__nav !== CC.nav)) return;
    }
    const recentes = (r.ultimosLancamentos || []).slice(0, 6);
    slot.innerHTML = `${filtros}${stale ? CC.staleNote(stale) : ''}
      <small class="muted hp-ctx">${esc(`${CC.mesNome(filtro.mes)} · ${nomeObra || 'todas as obras'}`)}</small>
      ${kpis(r)}
      <div class="card"><span class="sec-tit">Evolução · 12 meses</span>
        <span class="cs-leg"><span><i class="cs-q rec"></i>Receitas</span><span><i class="cs-q desp"></i>Despesas</span></span>
        ${grafico(r.tendencia)}${medias(r.tendencia)}</div>
      <div class="card"><span class="sec-tit">Despesas por categoria</span>${categorias(r.porCategoria)}</div>
      <div class="card hp-rec-card"><span class="line hp-head"><span class="sec-tit">Atividades recentes</span>
        <button class="chip-act" type="button" id="hp-todos">Ver todos${icon('arrow-right', 14)}</button></span>
        ${recentes.length ? recentes.map((t) => CC.txRow(t, [t.centro_nome, CC.dateBr(t.data)].filter(Boolean).join(' · '), true)).join('') : '<p class="sub mt-vazio">Nenhum lançamento neste mês.</p>'}</div>`;
    ligar();
    CC.$('#hp-todos', slot).addEventListener('click', () => CC.go('lancamentos', { mes: filtro.mes }));
    CC.wireTx(slot, ['home']);
  };

  // Numeros reais da carteira de obras (GET /centros-custo/portfolio-summary), como o desktop.
  CC.carteiraTiles = function (p, obras) {
    const n = (x) => Number(x || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    const h = p.laborHours || {}, fat = (p.clientBilling || {}).totalBilled || 0;
    const exec = (p.statusCounts && p.statusCounts.execucao) || 0;
    // Mesmo universo do desktop (CC-06): percentual e saldo so das obras com orcamento importado; "—" se faltar alguma.
    const c = p.comparable || {}, com = Number(c.centersWithBaseline || 0), sem = Number(c.centersWithoutBaseline || 0);
    const saldo = Number(c.balance) || 0;
    const pct = `${Number(c.burnRatePercent || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do orçado`;
    return CC.tiles([
      ['Obras', String(p.totalCenters != null ? p.totalCenters : obras.length), `${exec} em execução`],
      ['Contratado', moneyShort(p.contractedTotal != null ? p.contractedTotal : p.totalContractValue), 'soma dos contratos'],
      ['Realizado', moneyShort(p.totalRealizedCost), !com ? 'sem orçamento importado' : (sem ? `— · ${sem} sem orçamento` : pct)],
      ['Saldo', com ? `${saldo < 0 ? '− ' : ''}${moneyShort(Math.abs(saldo))}` : '—', !com ? 'sem orçamento' : (sem ? `de ${com} ${com === 1 ? 'obra' : 'obras'}` : 'orçado − realizado'), saldo < 0 ? 'warn-txt' : ''],
      ['Horas medidas', `${n(h.consumed)} h`, `de ${n(h.planned)} h`],
      ['Faturado', moneyShort(fat), p.totalContractValue > 0 ? `${n((fat / p.totalContractValue) * 100)}% do contrato` : 'sem contrato'],
    ]);
  };
})(window.CC = window.CC || {});
