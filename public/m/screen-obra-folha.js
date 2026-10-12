// Folhas para imprimir, salvar em PDF ou compartilhar no celular: relatorio executivo da obra e
// boletim de medicao. Mesmo conteudo do desktop (public/d/telas/obra-relatorio.js e obra-medicoes.js);
// a folha abre num iframe como o relatorio do servico (screen-servico-fim.js).
(function (CC) {
  const { esc, icon, money } = CC;
  const SIT = { execucao: 'Em execução', planejamento: 'Planejamento', pausado: 'Pausada', concluido: 'Concluída' };
  const centavos = (x) => Math.round(CC.cents(x) * 100);
  const rev = (ct) => [ct.number, ct.baselineVersion != null ? `REV ${String(ct.baselineVersion).padStart(2, '0')}` : ''].filter(Boolean).join(' ');
  const CSS = `*{box-sizing:border-box}body{margin:0;padding:18px;font:12px/1.45 'IBM Plex Sans','Segoe UI',Arial,sans-serif;color:#0b2530;background:#fff}
    header{display:flex;gap:12px;align-items:center;border-bottom:2px solid #0b7a98;padding-bottom:10px;margin-bottom:12px}header img{width:34px;height:auto}
    .eb{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#0a7896}h1{margin:2px 0;font-size:17px}h3{margin:16px 0 6px;font-size:13px}
    .mu{color:#4e6570}dl{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0 0 12px}dt{color:#4e6570}dd{margin:0;font-weight:600}
    .nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:6px}.nums span{border:1px solid #d6e4e9;border-radius:8px;padding:8px}
    .nums small{display:block;color:#4e6570;font-size:10.5px}.nums b{font-size:13.5px}.err{color:#b8452c}
    table{width:100%;border-collapse:collapse;font-size:10.5px}th,td{padding:5px 4px;border-bottom:1px solid #d6e4e9;text-align:left;vertical-align:top}
    th{color:#4e6570;font-weight:600}.n{text-align:right;white-space:nowrap}.obs{margin:10px 0}
    .ass{display:flex;gap:24px;margin-top:48px}.ass span{flex:1;border-top:1px solid #0b2530;padding-top:6px;text-align:center}
    @media print{body{padding:0}@page{margin:12mm}}`;

  function documento(titulo, linhas, numeros, corpo) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>
      <header><img src="${esc(location.origin)}/m/simbolo.png" alt=""><div><span class="eb">Construtec Engenharia</span><h1>${esc(titulo)}</h1><span class="mu">Emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</span></div></header>
      <dl>${linhas.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="nums">${numeros.map(([k, v, cls]) => `<span><small>${esc(k)}</small><b class="${cls || ''}">${esc(v)}</b></span>`).join('')}</div>${corpo}</body></html>`;
  }

  function relatorio(c, cmp) {
    const s = cmp.summary || {}, ct = cmp.contract || {}, h = cmp.laborHours || {}, abc = cmp.abcCurve || {};
    const classe = new Map();
    ['a', 'b', 'c'].forEach((k) => (abc[k] || []).forEach((i) => classe.set(i.lineId, k.toUpperCase())));
    const soma = (lista) => lista.reduce((x, i) => x + Number(i.realizedCost || 0), 0);
    const totalAbc = ['a', 'b', 'c'].reduce((t, k) => t + soma(abc[k] || []), 0);
    const linhaAbc = (k) => { const l = abc[k] || [], v = soma(l); return `<tr><td><b>${k.toUpperCase()}</b></td><td class="n">${l.length}</td><td class="n">${esc(money(v))}</td><td class="n">${totalAbc ? Math.round((v / totalAbc) * 100) : 0}%</td></tr>`; };
    const situacao = (i) => (i.isOverBudget ? 'Estourado' : (i.realizedCost > 0 ? 'Em execução' : 'Previsto'));
    const itens = (cmp.items || []).map((i) => `<tr><td>${esc(i.code || '—')}</td><td>${esc(i.name || i.description)}</td><td>${i.kind === 'labor' ? 'Mão de obra' : 'Material'}</td>
      <td class="n">${esc(`${Number(i.budgetedQuantity || 0).toLocaleString('pt-BR')} ${i.unit || ''}`.trim())}</td><td class="n">${esc(money(i.budgetedCost))}</td><td class="n">${esc(money(i.realizedCost))}</td>
      <td class="n">${esc(money(i.variance))}</td><td class="n">${esc(money(i.balance))}</td><td>${classe.get(i.lineId) || '—'}</td><td>${situacao(i)}</td></tr>`).join('');
    const sem = (cmp.unmapped && cmp.unmapped.items) || [];
    const semHtml = sem.length ? `<h3>Gastos sem vínculo ao orçamento</h3><table><thead><tr><th>Data</th><th>Descrição</th><th class="n">Valor</th></tr></thead><tbody>
      ${sem.map((u) => `<tr><td>${esc(CC.dateFull(String(u.date || '').slice(0, 10)))}</td><td>${esc(u.description || 'Despesa')}</td><td class="n">${esc(money(u.amount))}</td></tr>`).join('')}</tbody></table>` : '';
    return documento('Relatório de controle orçamentário', [
      ['Obra', [c.codigo, c.nome].filter(Boolean).join(' · ')], ['Cliente', c.cliente], ['Responsável', c.responsavel], ['Contrato', rev(ct)], ['Situação', SIT[c.situacao] || '']],
    [['Valor contratual', money(s.contractValue)], ['Custo base', money(s.baseCost)], ['Realizado líquido', money(s.realizedCost)], ['Exposição', money(s.exposure)],
      ['Saldo', money(s.balance), s.balance < 0 ? 'err' : ''], ['Consumo', `${Math.round(Number(s.burnRatePercent || 0))}% · ${Number(h.consumed || 0).toLocaleString('pt-BR')} de ${Number(h.planned || 0).toLocaleString('pt-BR')} h`]],
    `<h3>Curva ABC do realizado</h3><table><thead><tr><th>Classe</th><th class="n">Itens</th><th class="n">Realizado</th><th class="n">% do total</th></tr></thead><tbody>${linhaAbc('a')}${linhaAbc('b')}${linhaAbc('c')}</tbody></table>
      ${semHtml}<h3>Planilha de itens</h3><table><thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th class="n">Qtd</th><th class="n">Orçado</th><th class="n">Realizado</th><th class="n">Desvio</th><th class="n">Saldo</th><th>ABC</th><th>Status</th></tr></thead><tbody>${itens}</tbody></table>`);
  }

  function boletim(c, cmp, m, todas) {
    const acumulado = todas.filter((x) => x.status === 'approved' && x.measurement_number <= m.measurement_number).reduce((s, x) => s + centavos(x.measured_amount), 0) / 100;
    const contrato = Number((cmp.summary || {}).contractValue || 0);
    const itens = (cmp.items || []).map((i) => `<tr><td>${esc(i.code || '—')}</td><td>${esc(i.name || i.description)}</td><td>${esc(i.unit || '')}</td><td class="n">${esc(Number(i.budgetedQuantity || 0).toLocaleString('pt-BR'))}</td></tr>`).join('');
    return documento('Boletim de medição contratual', [
      ['Medição nº', String(m.measurement_number)], ['Contrato', rev(cmp.contract || {})], ['Obra', [c.codigo, c.nome].filter(Boolean).join(' · ')], ['Cliente', c.cliente],
      ['Período', `${CC.dateFull(m.period_start)} a ${CC.dateFull(m.period_end)}`], ['Responsável', c.responsavel]],
    [['Valor contratual', money(contrato)], ['Valor desta medição', money(m.measured_amount)], ['Acumulado até esta medição', money(acumulado)],
      ['Saldo contratual a medir', money((centavos(contrato) - centavos(acumulado)) / 100)], ['Situação', m.status === 'approved' ? 'Aprovada p/ faturamento' : String(m.status || '')]],
    `${m.notes ? `<p class="obs"><b>Observações:</b> ${esc(m.notes)}</p>` : ''}
      <h3>Itens contratados (referência)</h3><table><thead><tr><th>Item</th><th>Descrição</th><th>Unidade</th><th class="n">Qtd contratada</th></tr></thead><tbody>${itens}</tbody></table>
      <p class="mu obs">O valor medido refere-se ao avanço aprovado no período; as quantidades acima são as do orçamento contratado.</p>
      <div class="ass"><span>Construtec Engenharia</span><span>${esc(c.cliente || 'Cliente')}</span></div>`);
  }

  // params: id (obra), tipo ('relatorio' ou 'boletim'), med (id da medicao, no boletim).
  CC.screens['obra-folha'] = async function (params) {
    const id = Number(params && params.id), bol = params.tipo === 'boletim';
    const tab = bol ? 'medicoes' : 'orcado';
    const voltar = () => CC.go('obra', { id, tab });
    const head = (sub) => `<div class="top sv-top"><button class="back" type="button" id="voltar" aria-label="Voltar">${icon('caret-left', 20)}</button>
      <span class="grow"><h1>${bol ? 'Boletim de medição' : 'Relatório executivo'}</h1><small class="muted">${esc(sub)}</small></span></div>`;
    const el = CC.render(`${head('Carregando…')}<div class="skeleton" style="height:420px"></div>`, true, params);
    document.body.classList.add('no-tabs');
    CC.$('#voltar', el).addEventListener('click', voltar);
    let c, cmp, med;
    try {
      [c, cmp, med] = await Promise.all([CC.cached(`obra-${id}`, `/centros-custo/${id}/detalhes?mes=${CC.month()}`).then((r) => r.data.centro),
        CC.cached(`orcado-${id}`, `/centros-custo/${id}/orcado-realizado`).then((r) => r.data),
        bol ? CC.cached(`med-${id}`, `/centros-custo/${id}/medicoes`).then((r) => r.data) : null]);
    } catch (error) {
      if (params.__nav !== CC.nav) return;
      CC.errorScreen(el, error, () => CC.go('obra-folha', params));
      return;
    }
    if (params.__nav !== CC.nav) return;
    const m = bol ? ((med && med.contracts) || []).find((x) => String(x.id) === String(params.med)) : null;
    if (!cmp.hasBudget || (bol && !m)) {
      CC.render(`${head(c.nome)}<div class="empty">${icon('file-text', 28)}${bol ? 'Medição não encontrada.' : 'Esta obra ainda não tem orçamento importado.'}<small>${bol ? 'Ela pode ter sido removida.' : 'O relatório executivo usa o orçamento aprovado da obra.'}</small></div>`, true, params);
      document.body.classList.add('no-tabs');
      CC.$('#voltar').addEventListener('click', voltar);
      return;
    }
    const html = bol ? boletim(c, cmp, m, med.contracts || []) : relatorio(c, cmp);
    const nome = bol ? `boletim-medicao-${m.measurement_number}-${c.codigo || id}` : `relatorio-executivo-${c.codigo || id}`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const page = CC.render(`${head(`${c.codigo ? `${c.codigo} · ` : ''}${bol ? `Medição ${m.measurement_number}` : 'orçado × realizado'}`)}
      <iframe class="sv-rel" id="of-doc" src="${url}" title="${bol ? 'Boletim de medição' : 'Relatório executivo'}"></iframe>
      ${bol ? '' : `<button class="btn2" type="button" id="of-csv">${icon('download-simple', 18)}Planilha em CSV</button>`}
      <div class="actions"><button class="btn2" type="button" id="of-share">${icon('share-network', 18)}Compartilhar</button>
        <button class="btn" type="button" id="of-print">${icon('printer', 18)}Imprimir ou PDF</button></div>`, true, params);
    document.body.classList.add('no-tabs');
    CC.$('#voltar', page).addEventListener('click', () => { URL.revokeObjectURL(url); voltar(); });
    CC.$('#of-print', page).addEventListener('click', () => { try { CC.$('#of-doc', page).contentWindow.print(); } catch { window.open(url, '_blank'); } });
    const csv = CC.$('#of-csv', page);
    if (csv) csv.addEventListener('click', () => CC.abrirArquivo(`/centros-custo/${id}/orcado-realizado/csv`, `orcado-vs-realizado-${c.codigo || id}.csv`));
    CC.$('#of-share', page).addEventListener('click', async () => {
      const file = new File([html], `${nome}.html`, { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: bol ? 'Boletim de medição' : 'Relatório executivo' }); } catch { /* cancelado */ }
      } else {
        CC.toast('Use Imprimir ou PDF e salve o arquivo para enviar', 'file-text');
      }
    });
  };
})(window.CC = window.CC || {});
