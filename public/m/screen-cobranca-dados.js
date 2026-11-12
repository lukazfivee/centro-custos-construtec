// Editar os dados do acompanhamento de uma cobranca (mesmos campos e validacoes do desktop,
// public/d/telas/cobranca-dados.js). PUT /api/cloud-sync/cobrancas/:id com o registro inteiro (p6).
(function (CC) {
  const { esc, icon } = CC;
  const B = CC.cobr;
  const F = CC.fin;
  const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  const opcoes = (lista, atual) => lista.map(([k, t]) => `<option value="${k}"${k === atual ? ' selected' : ''}>${esc(t)}</option>`).join('');

  // params: { id, foco, aviso }.
  CC.screens['cobranca-dados'] = async function (params) {
    const id = String((params && params.id) || '');
    const voltar = () => CC.go('cobranca', { id });
    const el = F.carregando('Editar dados', '', voltar);
    let item, clientes = [];
    try {
      [item, clientes] = await Promise.all([B.abrirItem(id),
        CC.api('/cloud-sync/clientes').then((r) => ((r.data && r.data.clients) || []).filter((c) => c.active !== false)).catch(() => [])]);
    } catch (error) {
      return CC.errorScreen(el, { status: error.status, message: B.semNuvem(error) }, () => CC.screens['cobranca-dados'](params));
    }
    if (!item) { CC.toast('Esta cobrança não está mais na lista.', 'warning-circle'); return CC.go('cobrancas'); }
    const i = item;
    const page = CC.render(`${F.top('Editar dados', `${i.code} · ${i.name}`)}
      ${params.aviso ? `<div class="note ok">${icon('info', 18)}<span>${esc(params.aviso)}</span></div>` : ''}
      ${clientes.length ? `<label class="field"><span>Cliente cadastrado</span><select id="cd-cad"><option value="">Escolher um cliente cadastrado</option>
        ${clientes.map((c) => `<option value="${esc(c.id)}">${esc([c.company, c.name].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>` : ''}
      ${F.campo('Cliente', 'cd-cli', i.clientName, ' maxlength="160"')}
      <label class="field"><span>E-mails do cliente · até 15, separados por vírgula</span><textarea id="cd-emails" rows="2" autocapitalize="off" spellcheck="false" placeholder="financeiro@cliente.com.br">${esc((i.clientEmails || []).join(', '))}</textarea></label>
      <div class="grid2">${F.campo('Responsável', 'cd-resp', i.responsible, ' maxlength="120"')}${F.campo('Número da NF', 'cd-nf', i.invoiceNumber, ' placeholder="Ex.: 2.199"')}</div>
      <label class="field"><span>Situação da obra</span><select id="cd-op">${opcoes(B.OP, i.operationalStatus)}</select></label>
      <label class="field"><span>Situação financeira</span><select id="cd-fin">${opcoes(B.FIN, i.financialStatus)}</select></label>
      <div class="grid2">${F.campo('Valor do contrato (R$)', 'cd-contr', F.valorBr(i.contractAmount), ' inputmode="decimal" placeholder="0,00"')}
        ${F.campo('Valor a receber (R$)', 'cd-rec', F.valorBr(i.receivableAmount), ' inputmode="decimal" placeholder="0,00"')}</div>
      <div class="grid2">${F.campo('Conclusão', 'cd-concl', i.completionDate, ' type="date"')}${F.campo('Vencimento', 'cd-venc', i.dueDate, ' type="date"')}</div>
      <label class="field"><span>Observações</span><textarea id="cd-obs" rows="3" maxlength="2000">${esc(i.notes || '')}</textarea></label>
      <p class="alert" role="alert" id="err"></p>
      <div class="actions"><button class="btn" type="button" id="salvar">${icon('check', 18)}Salvar dados</button></div>`, true, params);
    document.body.classList.add('no-tabs');
    F.voltar(page, voltar);
    const v = (idc) => CC.$(`#${idc}`, page).value;
    const cad = CC.$('#cd-cad', page);
    if (cad) cad.addEventListener('change', () => {
      const c = clientes.find((x) => String(x.id) === cad.value);
      if (!c) return;
      CC.$('#cd-cli', page).value = c.company || c.name || '';
      const campo = CC.$('#cd-emails', page);
      const emails = new Set(campo.value.split(/[,;\s]+/).filter(Boolean));
      if (c.email) emails.add(String(c.email).toLowerCase());
      campo.value = [...emails].join(', ');
    });
    if (params.foco) { const f = CC.$(`#${params.foco}`, page); if (f) f.focus(); }
    CC.$('#salvar', page).addEventListener('click', async (e) => {
      const emails = [...new Set(v('cd-emails').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
      const contrato = v('cd-contr').trim() === '' ? 0 : CC.parseMoney(v('cd-contr'));
      const receber = v('cd-rec').trim() === '' ? 0 : CC.parseMoney(v('cd-rec'));
      const ruim = emails.find((x) => !EMAIL.test(x));
      if (ruim) return F.erro(page, `E-mail inválido: ${ruim}`);
      if (emails.length > 15) return F.erro(page, 'No máximo 15 e-mails.');
      if (!(contrato >= 0) || !(receber >= 0)) return F.erro(page, 'Confira os valores: use o formato 1.234,56.');
      if (v('cd-fin') === 'nf_emitida' && !v('cd-nf').trim()) return F.erro(page, 'Informe o número da NF.');
      F.erro(page, '');
      const b = e.currentTarget;
      CC.busy(b, 'Salvando…');
      try {
        await B.salvar(i, {
          clientName: v('cd-cli').trim(), clientEmails: emails, responsible: v('cd-resp').trim(), invoiceNumber: v('cd-nf').trim(),
          operationalStatus: v('cd-op'), financialStatus: v('cd-fin'), contractAmount: contrato, receivableAmount: receber,
          completionDate: v('cd-concl') || null, dueDate: v('cd-venc') || null, notes: v('cd-obs').trim(),
        });
      } catch (error) { F.solta(b, 'check', 'Salvar dados'); return F.erro(page, error.status === 0 ? 'Sem internet. Salvar precisa da conexão.' : error); }
      CC.toast('Dados da cobrança salvos');
      return voltar();
    });
    return undefined;
  };
})(window.CC = window.CC || {});
