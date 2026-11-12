// Aba Medicoes da obra no celular: mao de obra (horas) e contrato (cliente), historico, boletim e
// registrar. Mesmas rotas e regras do desktop (public/d/telas/obra-medicoes.js); lancar exige p12.
(function (CC) {
  const { esc, icon, money } = CC;
  const horas = (x) => Number(x || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const centavos = (x) => Math.round(CC.cents(x) * 100);
  const periodo = (m) => `${CC.dateFull(m.period_start)} a ${CC.dateFull(m.period_end)}`;
  let tipo = 'mo';

  // Indicadores compactos em grade de 3 colunas (duas linhas cabem em 375 px sem rolagem).
  // itens: [rotulo, valor, detalhe, classe do valor].
  CC.tiles = (itens) => `<div class="mt-tiles">${itens.map(([l, v, s, cls]) => `<span class="mt-tile"><small>${esc(l)}</small><b class="${cls || ''}">${esc(v)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span>`).join('')}</div>`;
  CC.slotErro = (slot, error, semDados) => {
    slot.innerHTML = `<div class="empty">${icon(error.status === 0 ? 'wifi-slash' : 'warning-circle', 24)}${esc(error.status === 0 ? semDados : error.message)}</div>`;
  };

  // Segunda a sabado da semana atual (como o desktop).
  function semana() {
    const d = new Date();
    const seg = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const sab = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + 5);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return [iso(seg), iso(sab)];
  }

  CC.obraMedicoes = async function (slot, c) {
    slot.innerHTML = '<div class="skeleton"></div>';
    let med, cmp;
    try {
      [med, cmp] = await Promise.all([CC.cached(`med-${c.id}`, `/centros-custo/${c.id}/medicoes`).then((r) => r.data),
        CC.cached(`orcado-${c.id}`, `/centros-custo/${c.id}/orcado-realizado`).then((r) => r.data), CC.sv ? CC.sv.loadPerms() : null]);
    } catch (error) { return CC.slotErro(slot, error, 'Sem internet e sem medições salvas.'); }
    if (!slot.isConnected) return undefined;
    if (!med.contractId || !cmp.hasBudget) {
      slot.innerHTML = `<div class="empty">${icon('list-checks', 28)}Esta obra ainda não tem contrato ativo.<small>As medições começam depois de importar o orçamento aprovado do Orçamentos.</small></div>`;
      return undefined;
    }
    const pode = CC.sv ? CC.sv.can('p12') : false;
    const lab = med.labor || [];
    const cts = (med.contracts || []).slice().sort((a, b) => b.measurement_number - a.measurement_number);
    const planejadas = Number((cmp.laborHours || {}).planned || 0);
    const medidas = lab.reduce((s, m) => s + Number(m.team_hours || 0), 0);
    const contrato = Number((cmp.summary || {}).contractValue || 0);
    const medido = cts.filter((m) => m.status === 'approved').reduce((s, m) => s + centavos(m.measured_amount), 0) / 100;
    const mo = tipo === 'mo';
    const saldoH = planejadas - medidas;
    const kpis = mo ? [['Planejadas', `${horas(planejadas)} h`, 'do orçamento'], ['Medidas', `${horas(medidas)} h`, planejadas ? `${Math.round((medidas / planejadas) * 100)}% do plano` : ''],
      ['Saldo', `${horas(saldoH)} h`, saldoH < 0 ? 'acima do plano' : 'a executar', saldoH < 0 ? 'warn-txt' : '']]
      : [['Contrato', CC.moneyShort(contrato), (cmp.contract || {}).number || ''], ['Medido', CC.moneyShort(medido), contrato ? `${Math.round((medido / contrato) * 100)}% do contrato` : ''],
        ['A faturar', CC.moneyShort((centavos(contrato) - centavos(medido)) / 100), 'próximas medições']];
    const linhasMo = lab.map((m) => `<div class="tx"><span class="grow"><b>${esc(periodo(m))}</b><small>${esc([m.notes, m.created_by_name].filter(Boolean).join(' · ') || 'Sem observação')}</small></span>
      <span class="amt">${esc(`${horas(m.team_hours)} h`)}</span></div>`).join('');
    const linhasCt = cts.map((m) => `<div class="tx mt-med"><span class="grow"><b>Medição ${esc(m.measurement_number)}</b><small>${esc(periodo(m))}${m.status === 'approved' ? ' · Aprovada' : ` · ${esc(m.status)}`}</small>
      ${m.notes ? `<small>${esc(m.notes)}</small>` : ''}</span><span class="amt">${esc(money(m.measured_amount))}</span>
      <button class="back" type="button" data-boletim="${esc(m.id)}" aria-label="Boletim da medição ${esc(m.measurement_number)}">${icon('file-text', 20)}</button></div>`).join('');
    slot.innerHTML = `<div class="seg" role="group" aria-label="Tipo de medição">${[['mo', 'Mão de obra'], ['ct', 'Contrato (cliente)']].map(([k, l]) => `<button type="button" data-med="${k}" aria-pressed="${k === tipo}">${l}</button>`).join('')}</div>
      ${CC.tiles(kpis)}
      ${pode ? `<button class="btn2" type="button" id="med-nova">${icon('plus', 18)}${mo ? 'Registrar horas da equipe' : 'Registrar medição ao cliente'}</button>` : ''}
      <span class="label">Histórico</span>
      <div class="mt-lista">${(mo ? linhasMo : linhasCt) || `<p class="sub mt-vazio">${mo ? 'Nenhuma medição de horas ainda.' : 'Nenhuma medição ao cliente ainda.'}</p>`}</div>`;
    const recarregar = () => CC.obraMedicoes(slot, c);
    CC.$$('[data-med]', slot).forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.med; recarregar(); }));
    CC.$$('[data-boletim]', slot).forEach((b) => b.addEventListener('click', () => CC.go('obra-folha', { id: c.id, tipo: 'boletim', med: b.dataset.boletim })));
    const nova = CC.$('#med-nova', slot);
    if (nova) nova.addEventListener('click', () => registrar(c, mo, cts.length ? cts[0].measurement_number + 1 : 1, recarregar));
    return undefined;
  };

  function registrar(c, mo, proximo, aoSalvar) {
    const [ini, fim] = semana();
    const sh = CC.sheet('med-nova', `${CC.sheetHead(mo ? 'hard-hat' : 'list-checks', mo ? 'Registrar horas da equipe' : 'Registrar medição ao cliente')}
      <p class="muted od-sub">${esc(c.nome)}</p>
      ${mo ? '' : `<label class="field"><span>Nº da medição</span><input id="md-num" type="number" inputmode="numeric" min="1" step="1" value="${esc(proximo)}"></label>`}
      <div class="grid2 mt-gap"><label class="field"><span>Início</span><input id="md-ini" type="date" value="${esc(ini)}"></label>
        <label class="field"><span>Fim</span><input id="md-fim" type="date" value="${esc(fim)}"></label></div>
      ${mo ? '<label class="field mt-gap"><span>Horas da equipe</span><input id="md-h" inputmode="decimal" autocomplete="off" placeholder="Ex.: 8,5"></label>'
        : '<label class="field money mt-gap"><span>Valor medido (R$)</span><input id="md-v" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>'}
      <label class="field mt-gap"><span>${mo ? 'Frente de trabalho / observações' : 'Boletim / observações'}</span><input id="md-obs" maxlength="500" autocomplete="off" placeholder="${mo ? 'Ex.: instalação da central' : 'Ex.: aprovado pela fiscalização'}"></label>
      <div id="md-err"></div>
      <div class="grid2 od-acts"><button class="btn2" type="button" id="md-cancel">Cancelar</button><button class="btn" type="button" id="md-ok">${icon('check', 18)}Registrar</button></div>`);
    const $ = (id) => CC.$(`#${id}`, sh.el);
    const falha = (message, status) => { $('md-err').innerHTML = CC.sheetErr({ message, status }); };
    $('md-cancel').addEventListener('click', sh.close);
    $('md-ok').addEventListener('click', async (e) => {
      const periodStart = $('md-ini').value, periodEnd = $('md-fim').value, notes = $('md-obs').value.trim() || null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return falha('Informe o início e o fim.');
      if (periodEnd < periodStart) return falha('O fim não pode ser antes do início.');
      let body;
      if (mo) {
        const raw = String($('md-h').value).trim();
        const teamHours = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
        if (!(teamHours >= 0.5)) return falha('Informe pelo menos 0,5 hora.');
        body = { type: 'labor', periodStart, periodEnd, teamHours, notes };
      } else {
        const n = Number($('md-num').value), valor = CC.parseMoney($('md-v').value);
        if (!(Number.isInteger(n) && n >= 1)) return falha('Número da medição inválido.');
        if (!(valor >= 0.01)) return falha('Informe o valor medido.');
        body = { type: 'contract', measurementNumber: n, periodStart, periodEnd, measuredAmount: valor, notes };
      }
      const b = e.currentTarget;
      CC.busy(b, 'Registrando…');
      try { await CC.api(`/centros-custo/${c.id}/medicoes`, { method: 'POST', body }); } catch (error) {
        b.disabled = false; b.innerHTML = `${icon('check', 18)}Registrar`;
        return falha(error.message, error.status);
      }
      sh.close();
      CC.toast(mo ? 'Horas registradas' : 'Medição registrada');
      return aoSalvar();
    });
  }
})(window.CC = window.CC || {});
