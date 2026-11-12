// Importar orcamento / atualizar revisao (arquivo .json do Orcamentos, PDF opcional da proposta, previa e
// confirmacao) e vincular gastos sem vinculo a insumos. Mesmo fluxo do desktop (public/d/telas/obra-importar.js);
// o servidor exige p5 nas tres rotas de escrita.
(function (CC) {
  const { esc, icon, money } = CC;
  const MAX_PDF = 5 * 1024 * 1024; // mesmo limite do POST /centros-custo/:id/proposta
  const rev = (p) => `${p.number} REV ${String(p.revision == null ? 0 : p.revision).padStart(2, '0')}`;
  const amigavel = (m) => (/HASH_MISMATCH/.test(m) ? 'O arquivo foi alterado depois de exportado do Orçamentos: a assinatura não confere. Exporte a proposta de novo.'
    : (/CONFLICT/.test(m) ? 'Esta revisão já foi importada com conteúdo diferente. Confira no Orçamentos qual é a revisão certa.' : m));
  const tamanho = (b) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const lerBase64 = (arquivo) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',').pop() || '');
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(arquivo);
  });
  const lerTexto = (arquivo) => (arquivo.text ? arquivo.text() : new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsText(arquivo);
  }));
  const net = (error, m) => (error.status === 0 ? `Sem internet. ${m} precisa da conexão.` : amigavel(error.message));

  function previaHtml(p) {
    if (p.status === 'already_imported') return `<div class="note ok">${icon('info', 18)}<span>${esc(rev(p.proposal))} já foi importada antes. Nada a fazer.</span></div>`;
    if (p.status === 'conflict') return `<div class="note off">${icon('warning-circle', 18)}<span>${esc(p.message || 'Esta revisão já foi importada com conteúdo diferente.')}</span></div>`;
    const t = p.totals || {}, alvo = p.targetCostCenter;
    const destino = alvo ? `${alvo.isNew ? 'Nova obra: ' : ''}${[alvo.code, alvo.name].filter(Boolean).join(' · ')}` : '—';
    const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    return `<div class="note ok">${icon('check-circle', 18)}<span>Arquivo conferido: o conteúdo bate com a assinatura do Orçamentos.</span></div>
      <div class="card">${kv('Proposta', rev(p.proposal))}${kv('Cliente', (p.client && p.client.name) || '—')}${kv('Obra', destino)}
        ${kv('Valor do contrato', money(t.contractValue || 0))}${kv('Custo base', money(t.baseCost || 0))}${kv('Itens', `${p.materialsCount || 0} materiais · ${p.laborCount || 0} de mão de obra`)}</div>
      ${p.isReplacement ? `<div class="note off">${icon('warning-circle', 18)}<span>Esta revisão atualiza a baseline atual da obra e mantém o mesmo contrato. A revisão anterior fica no histórico.</span></div>` : ''}`;
  }

  // c: obra de destino ("Atualizar revisao") ou null (importar pela lista de obras). aoConcluir(resultado).
  CC.obraImportar = function (c, aoConcluir) {
    const obraId = c ? c.id : null;
    let previa = null, pdf = null, enviando = false;
    const sh = CC.sheet('obra-importar', `${CC.sheetHead('file-arrow-down', c ? 'Atualizar revisão do orçamento' : 'Importar orçamento')}
      <p class="muted od-sub">${c ? esc(c.nome) : 'Arquivo .json exportado do Orçamentos e, se quiser, o PDF da proposta'}</p>
      <label class="btn2 mt-file">${icon('file-text', 18)}<span id="im-json-nome">Escolher o arquivo .json da proposta</span><input class="sr" type="file" id="im-json" accept=".json,application/json"></label>
      <div id="im-previa" class="mt-previa"></div>
      <label class="btn2 mt-file">${icon('file-pdf', 18)}<span id="im-pdf-nome">PDF da proposta (opcional, até 5 MB)</span><input class="sr" type="file" id="im-pdf" accept=".pdf,application/pdf"></label>
      <div id="im-err"></div>
      <div class="grid2 od-acts"><button class="btn2" type="button" id="im-cancel">Cancelar</button><button class="btn" type="button" id="im-ok" disabled>Confirmar</button></div>`);
    const $ = (id) => CC.$(`#${id}`, sh.el);
    const erro = (m) => { $('im-err').innerHTML = m ? CC.sheetErr({ message: m, status: 400 }) : ''; };
    // So o PDF, numa obra que ja existe, tambem vale: guarda ou troca a proposta sem reimportar.
    const soPdf = () => !!pdf && !!obraId && !$('im-json').files[0];
    const botao = () => {
      const ok = $('im-ok');
      ok.disabled = enviando || !((previa && previa.status === 'ready') || soPdf());
      if (!enviando) ok.innerHTML = `${icon('check', 18)}${soPdf() ? 'Anexar PDF' : 'Confirmar importação'}`;
    };
    botao();
    $('im-cancel').addEventListener('click', sh.close);
    $('im-pdf').addEventListener('change', () => {
      erro('');
      const f = $('im-pdf').files[0];
      pdf = null;
      $('im-pdf-nome').textContent = 'PDF da proposta (opcional, até 5 MB)';
      if (f) {
        if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf')) { $('im-pdf').value = ''; erro('A proposta deve ser um arquivo PDF.'); }
        else if (f.size > MAX_PDF) { $('im-pdf').value = ''; erro('A proposta em PDF deve ter no máximo 5 MB.'); }
        else { pdf = f; $('im-pdf-nome').textContent = `${f.name} · ${tamanho(f.size)}`; }
      }
      botao();
    });
    $('im-json').addEventListener('change', async () => {
      erro('');
      previa = null;
      $('im-previa').innerHTML = '';
      const f = $('im-json').files[0];
      $('im-json-nome').textContent = f ? f.name : 'Escolher o arquivo .json da proposta';
      botao();
      if (!f) return;
      let envelope;
      try { envelope = JSON.parse(await lerTexto(f)); } catch { erro('O arquivo não é um .json válido do Orçamentos.'); return; }
      $('im-previa').innerHTML = '<div class="skeleton"></div>';
      try {
        previa = (await CC.api('/integracao/orcamentos/previas', { method: 'POST', body: obraId ? { ...envelope, options: { costCenterId: obraId } } : envelope })).data;
        $('im-previa').innerHTML = previaHtml(previa);
      } catch (error) {
        $('im-previa').innerHTML = '';
        erro(net(error, 'Importar'));
      }
      botao();
    });
    $('im-ok').addEventListener('click', async () => {
      if (enviando || !(previa || soPdf())) return;
      enviando = true;
      CC.busy($('im-ok'), 'Enviando…');
      let importado = null;
      try {
        if (previa && previa.status === 'ready') {
          const destino = obraId || (previa.targetCostCenter && previa.targetCostCenter.id) || null;
          importado = (await CC.api(`/integracao/orcamentos/previas/${encodeURIComponent(previa.previewId)}/confirmar`, { method: 'POST', body: { hash: previa.hash, costCenterId: destino } })).data;
        }
        const alvo = (importado && importado.costCenterId) || obraId;
        if (pdf && alvo) {
          try {
            await CC.api(`/centros-custo/${alvo}/proposta`, { method: 'POST', body: { nome: pdf.name, tipo: 'application/pdf', conteudoBase64: await lerBase64(pdf) } });
          } catch (error) {
            // O orcamento ja foi importado: nao desfaz. Se era so o PDF, a folha fica aberta para tentar de novo.
            if (!importado) throw error;
            sh.close();
            CC.toast(`Orçamento ${rev(previa.proposal)} importado, mas o PDF não foi guardado: ${error.message}`, 'warning-circle');
            if (aoConcluir) aoConcluir(importado);
            return;
          }
        }
        sh.close();
        CC.toast(importado ? `Orçamento ${rev(previa.proposal)} importado${pdf ? ' com o PDF da proposta' : ''}` : 'PDF da proposta guardado');
        if (aoConcluir) aoConcluir(importado);
      } catch (error) {
        erro(net(error, 'Importar'));
      } finally {
        enviando = false;
        if (document.body.contains(sh.el)) botao();
      }
    });
  };

  // Vincular os gastos sem vinculo a um insumo da planilha (um por vez, como no desktop).
  CC.obraVincular = function (c, cmp, aoConcluir) {
    const itens = cmp.items || [];
    const pendentes = ((cmp.unmapped && cmp.unmapped.items) || []).slice();
    let mudou = false;
    const opcoes = `<option value="">Escolha o insumo</option>${itens.map((i) => `<option value="${esc(i.controlItemId)}">${esc(`${i.name || i.description} (${i.kind === 'labor' ? 'mão de obra' : 'material'} · saldo ${money(i.balance)})`)}</option>`).join('')}`;
    const lista = () => pendentes.map((g) => `<div class="card mt-vinc" data-gasto="${esc(g.id)}"><b>${esc(g.description || 'Despesa')}</b>
      <small class="muted">${esc([CC.dateFull(String(g.date || '').slice(0, 10)), money(g.amount)].filter(Boolean).join(' · '))}</small>
      <label class="field"><span class="sr">Insumo para ${esc(g.description || 'a despesa')}</span><select>${opcoes}</select></label>
      <button class="btn2" type="button" data-ligar>${icon('check', 18)}Vincular</button></div>`).join('') || `<div class="empty">${icon('check-circle', 24)}Todos os gastos estão vinculados.</div>`;
    const sh = CC.sheet('obra-vincular', `${CC.sheetHead('paperclip', 'Vincular gastos a insumos')}
      <p class="muted od-sub">${pendentes.length} gasto${pendentes.length === 1 ? '' : 's'} sem vínculo · ${esc(c.nome)}</p>
      <p class="od-txt">Ligue cada gasto a um insumo da planilha para o consumo ficar certo.</p>
      <div id="vc-err"></div><div class="mt-vincs" id="vc-lista">${lista()}</div>
      <button class="btn2 od-acts mt-full" type="button" id="vc-fim">Fechar</button>`);
    const fechar = () => { sh.close(); if (mudou && aoConcluir) aoConcluir(); };
    CC.$('#vc-fim', sh.el).addEventListener('click', fechar);
    sh.el.addEventListener('click', (e) => { if (mudou && (e.target === sh.el || e.target.closest('.sheet-x')) && aoConcluir) aoConcluir(); });
    CC.$('#vc-lista', sh.el).addEventListener('click', async (e) => {
      const bt = e.target.closest('[data-ligar]');
      if (!bt) return;
      const card = bt.closest('[data-gasto]');
      const insumo = CC.$('select', card).value;
      const err = CC.$('#vc-err', sh.el);
      if (!insumo) { err.innerHTML = CC.sheetErr({ message: 'Escolha o insumo antes de vincular.', status: 400 }); return; }
      err.innerHTML = '';
      CC.busy(bt, 'Vinculando…');
      try {
        await CC.api(`/centros-custo/${c.id}/apropriacoes`, { method: 'POST', body: { allocationId: card.dataset.gasto, contractId: cmp.contract.id, controlItemId: insumo } });
      } catch (error) {
        bt.disabled = false; bt.innerHTML = `${icon('check', 18)}Vincular`;
        err.innerHTML = CC.sheetErr(error);
        return;
      }
      mudou = true;
      pendentes.splice(pendentes.findIndex((g) => String(g.id) === card.dataset.gasto), 1);
      CC.$('#vc-lista', sh.el).innerHTML = lista();
      CC.toast(pendentes.length ? 'Gasto vinculado' : 'Todos os gastos estão vinculados');
    });
  };
})(window.CC = window.CC || {});
