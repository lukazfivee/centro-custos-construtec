// Aba Curva S da obra no celular: indicadores (BAC, AC, EV, CPI, EAC, VAC), grafico acumulado em SVG
// (previsto tracejado, realizado e medido), como ler, mes a mes e premissas. GET /centros-custo/:id/curva-s.
(function (CC) {
  const { esc, icon, money, moneyShort } = CC;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (m) => { const [a, n] = String(m).split('-').map(Number); return `${MES[(n || 1) - 1]}${a ? `/${String(a).slice(2)}` : ''}`; };
  const pct = (x) => (x == null ? '—' : `${Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  CC.mesCurto = nomeMes;

  // Grafico pensado para 340 px de largura: texto do SVG em tamanho real, sem biblioteca.
  function grafico(tl, bac, contrato) {
    const W = 340, H = 196, esq = 34, dir = 8, topo = 8, alto = 160;
    const n = tl.length;
    const x = (i) => esq + (n <= 1 ? (W - esq - dir) / 2 : (i / (n - 1)) * (W - esq - dir));
    const y = (p) => topo + alto * (1 - Math.max(0, Math.min(1.05, p)) / 1.05);
    const serie = (campo, base, cls, nome) => {
      const pts = tl.map((t, i) => (t[campo] == null || !base ? null : [x(i), y(Number(t[campo]) / base), t])).filter(Boolean);
      if (!pts.length) return '';
      const linha = pts.length > 1 ? `<polyline class="cs-${cls}" points="${pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}" fill="none"></polyline>` : '';
      const ult = pts[pts.length - 1];
      const marcas = pts.map(([px, py, t]) => `<circle class="cs-alvo" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9"><title>${esc(`${nomeMes(t.month)} · ${nome} ${money(t[campo])}`)}</title></circle>`).join('');
      return `${linha}<circle class="cs-p-${cls}" cx="${ult[0].toFixed(1)}" cy="${ult[1].toFixed(1)}" r="4"></circle>${marcas}`;
    };
    const grade = [0, 0.5, 1].map((p) => `<line class="cs-grade" x1="${esq}" x2="${W - dir}" y1="${y(p).toFixed(1)}" y2="${y(p).toFixed(1)}"></line><text class="cs-eixo" x="${esq - 6}" y="${(y(p) + 3.5).toFixed(1)}" text-anchor="end">${p * 100}%</text>`).join('');
    const passo = Math.max(1, Math.ceil(n / 5));
    const rotX = tl.map((t, i) => (i % passo === 0 || i === n - 1 ? `<text class="cs-eixo" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 && n > 1 ? 'start' : (i === n - 1 && n > 1 ? 'end' : 'middle')}">${esc(nomeMes(t.month))}</text>` : '')).join('');
    return `<svg class="cs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva S acumulada: previsto, realizado e medido em relação ao total">${grade}${rotX}
      ${serie('plannedCumulative', bac, 'prev', 'previsto')}${serie('measuredCumulative', contrato, 'med', 'medido')}${serie('realizedCumulative', bac, 'real', 'realizado')}</svg>`;
  }

  CC.obraCurva = async function (slot, c) {
    slot.innerHTML = '<div class="skeleton" style="height:220px"></div>';
    let d;
    try { d = (await CC.cached(`curva-${c.id}`, `/centros-custo/${c.id}/curva-s`)).data; } catch (error) {
      if (error.status === 404 || error.status === 400) {
        slot.innerHTML = `<div class="empty">${icon('trend-up', 28)}Esta obra ainda não tem orçamento importado.<small>A Curva S usa o orçamento aprovado e as medições ao cliente.</small></div>`;
        return;
      }
      CC.slotErro(slot, error, 'Sem internet e sem a Curva S salva.');
      return;
    }
    if (!slot.isConnected) return;
    const e = d.evm || {}, ce = d.center || {}, tl = d.timeline || [];
    if (!tl.length) {
      slot.innerHTML = `<div class="empty">${icon('trend-up', 28)}Sem cronograma para calcular a Curva S.<small>Confira o início e o término da obra (Editar obra).</small></div>`;
      return;
    }
    const cpi = e.cpi == null ? '—' : Number(e.cpi).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const kpis = [
      ['Orçado', moneyShort(e.bac), 'custo base'],
      ['Realizado', moneyShort(e.ac), `${pct(e.financialBurnPercent)} consumido`, e.ac > e.bac ? 'warn-txt' : ''],
      ['Valor agregado', e.ev == null ? '—' : moneyShort(e.ev), `${pct(e.physicalPercent)} medido`],
      ['Eficiência', cpi, e.cpi == null ? 'sem medição' : (e.cpi >= 1 ? 'dentro do avanço' : 'acima do avanço'), e.cpi != null && e.cpi < 1 ? 'warn-txt' : ''],
      ['Projeção', e.eac == null ? '—' : moneyShort(e.eac), 'custo estimado'],
      ['Desvio final', e.vac == null ? '—' : `${e.vac < 0 ? '−' : ''}${moneyShort(Math.abs(e.vac))}`, e.vac == null ? '' : (e.vac < 0 ? 'sobrecusto' : 'economia'), e.vac != null && e.vac < 0 ? 'warn-txt' : ''],
    ];
    const din = (v) => (v == null ? '—' : esc(moneyShort(v)));
    const meses = tl.map((t) => `<div class="cs-mes"><b>${esc(nomeMes(t.month))}</b><span class="orc-nums"><span>Previsto <b>${din(t.plannedCumulative)}</b></span>
      <span>Realizado <b>${din(t.realizedCumulative)}</b></span><span>Medido <b>${din(t.measuredCumulative)}</b></span></span></div>`).join('');
    slot.innerHTML = `${CC.tiles(kpis)}
      <div class="card cs-card"><span class="label">Acumulado · % do total</span>
        <span class="cs-leg"><span><i class="cs-q prev"></i>Previsto</span><span><i class="cs-q real"></i>Realizado</span><span><i class="cs-q med"></i>Medido</span></span>
        ${grafico(tl, Number(e.bac || ce.baseCost || 0), Number(ce.contractValue || 0))}
        ${e.projectedStatus ? `<small class="muted">${esc(e.projectedStatus)}</small>` : ''}</div>
      <div class="note mt-note">${icon('info', 18)}<span><b>Como ler:</b> previsto segue a distribuição S do orçamento aprovado; realizado é o custo lançado; medido é o avanço aprovado pelo cliente (em relação ao contrato). Eficiência de custo (CPI) abaixo de 1 indica custo acima do avanço.</span></div>
      <span class="label">Mês a mês · acumulado</span><div class="cs-meses">${meses}</div>
      ${(d.hypotheses || []).length ? `<span class="label">Premissas</span><ul class="cs-prem">${d.hypotheses.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}`;
  };
})(window.CC = window.CC || {});
