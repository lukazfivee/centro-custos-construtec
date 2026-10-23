// Inventário operacional do técnico, com recebimento assinado na própria sessão.
(function (CC) {
  const { esc, icon } = CC;
  const queuedId = (id) => `logi-ass-${id}`;
  const labelSituacao = (value) => value === 'em_falta' ? 'Falta registrada' : value === 'com_tecnico' ? 'Com você' : value.replaceAll('_', ' ');

  CC.screens['meu-kit'] = async function (params) {
    const el = CC.render(`${CC.header('')}<h1 class="title">Meu kit de ferramentas</h1><div class="skeleton"></div>`, false, params);
    let kit, stale = false;
    try { const result = await CC.cached('meu-kit', '/logistica/meu-kit'); kit = result.data; stale = result.stale; }
    catch (error) { return CC.errorScreen(el, error, () => CC.go('meu-kit')); }
    if (params && params.__nav !== CC.nav) return;
    const fila = (await CC.queue.ops()).filter((item) => item.op === 'logistica-assinatura');
    const pendentes = kit.recibos.filter((receipt) => receipt.status === 'aguardando_assinatura' || receipt.status === 'divergencia');
    const missing = kit.faltas.map((item) => `<article class="card lgm-item falta"><b>${esc(item.nome)}</b><span>${esc(item.codigo)} · falta registrada</span></article>`).join('');
    const padrao = kit.kitPadrao.map((item) => {
      const tools = kit.ferramentas.filter((tool) => tool.nome.toLowerCase() === item.nome.toLowerCase());
      const units = tools.map((tool) => `<span>${esc(tool.codigo)} · ${esc(labelSituacao(tool.situacao))}</span>${tool.situacao === 'com_tecnico' ? `<button class="btn2" type="button" data-falta="${tool.id}">Relatar falta</button>` : ''}`).join('');
      return `<article class="card lgm-item${item.falta ? ' falta' : ''}"><b>${esc(item.nome)}</b><span>${item.emPosse} de ${item.quantidade} no kit${item.falta ? ` · faltam ${item.falta}` : ''}</span>${units}</article>`;
    }).join('');
    const extras = kit.extras.map((item) => `<article class="card lgm-item"><b>${esc(item.nome)}</b><span>${esc(item.codigo)} · ferramenta extra · ${esc(labelSituacao(item.situacao))}</span>${item.situacao === 'com_tecnico' ? `<button class="btn2" type="button" data-falta="${item.id}">Relatar falta</button>` : ''}</article>`).join('');
    const receipts = pendentes.map((receipt) => {
      const op = fila.find((item) => Number(item.reciboId) === Number(receipt.id));
      const estado = receipt.status === 'divergencia' ? `Aguardando Logística revisar: ${esc(receipt.divergencia || '')}` : op ? (op.estado === 'erro' ? `Assinatura não enviada: ${esc(op.erro)}` : 'Assinado no celular · aguardando envio') : 'Confirme o recebimento com sua assinatura.';
      const contents = [...(receipt.ferramentas || []).map((item) => `${esc(item.nome)} (${esc(item.codigo)})`), ...(receipt.materiais || []).map((item) => `${esc(item.nome)} · ${esc(item.quantidade)} ${esc(item.unidade)}`)].join(', ');
      return `<article class="card lgm-recibo"><div><b>Ficha ${esc(receipt.tipo.replaceAll('_', ' '))} #${esc(receipt.id)}</b><span>${esc(CC.dateFull(receipt.criado_em.slice(0, 10)))} · ${esc(estado)}${contents ? ` · ${contents}` : ''}</span></div>${receipt.status === 'aguardando_assinatura' && !op ? `<button class="btn" type="button" data-assinar="${receipt.id}">${icon('signature', 18)}Assinar recebimento</button>` : ''}${op?.estado === 'erro' ? `<button class="btn2" type="button" data-retry="${esc(op.client_id)}">Tentar assinatura novamente</button>` : ''}${receipt.status === 'aguardando_assinatura' ? `<button class="btn2" type="button" data-divergencia="${receipt.id}">Informar divergência</button>` : ''}</article>`;
    }).join('');
    el.innerHTML = `${CC.header('')}<h1 class="title">Meu kit de ferramentas</h1><p class="sub">Confira as ferramentas sob sua responsabilidade e as fichas para assinatura.</p>
      ${stale ? '<div class="card lgm-alert" role="status">Sem conexão · mostrando a última atualização salva neste celular.</div>' : ''}
      ${kit.incompleto ? '<div class="card lgm-alert" role="status">Seu kit padrão está incompleto. As faltas continuam sinalizadas até a reposição.</div>' : ''}
      <h2 class="label">Kit padrão</h2><div class="lgm-list">${padrao || '<p class="sub">O kit padrão ainda não foi configurado pela Logística.</p>'}</div>
      ${missing ? `<h2 class="label">Faltas</h2><div class="lgm-list">${missing}</div>` : ''}
      <h2 class="label">Ferramentas extras</h2><div class="lgm-list">${extras || '<p class="sub">Nenhuma ferramenta extra atribuída.</p>'}</div>
      <h2 class="label">Fichas de recebimento</h2><div class="lgm-list">${receipts || '<p class="sub">Nenhuma ficha aguardando sua assinatura.</p>'}</div>`;
    CC.$$('[data-assinar]', el).forEach((button) => button.addEventListener('click', () => assinar(button.dataset.assinar)));
    CC.$$('[data-falta]', el).forEach((button) => button.addEventListener('click', () => relatarFalta(button.dataset.falta)));
    CC.$$('[data-divergencia]', el).forEach((button) => button.addEventListener('click', () => relatarDivergencia(button.dataset.divergencia)));
    CC.$$('[data-retry]', el).forEach((button) => button.addEventListener('click', async () => { await CC.queue.retry(button.dataset.retry); CC.go('meu-kit'); }));
  };

  function assinar(receiptId) {
    const sh = CC.sheet('lgm-sheet', `${CC.sheetHead('signature', 'Assinar recebimento')}<p class="sub">A assinatura confirma o recebimento dos itens descritos nesta ficha.</p>
      <div class="lgm-pad"><canvas id="lgm-canvas" aria-label="Área para desenhar sua assinatura"></canvas><span id="lgm-hint">Desenhe sua assinatura aqui</span><button type="button" id="lgm-limpar" hidden>Limpar</button></div>
      <p class="sub">A data e a hora serão salvas junto com a assinatura.</p><button class="btn lgm-full" type="button" id="lgm-ok" disabled>Confirmar assinatura</button>`);
    const canvas = CC.$('#lgm-canvas', sh.el), ctx = canvas.getContext('2d'), ratio = window.devicePixelRatio || 1, box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio);
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b2530';
    let drawing = false, strokes = 0;
    const ok = CC.$('#lgm-ok', sh.el);
    const pos = (event) => { const rect = canvas.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; };
    canvas.addEventListener('pointerdown', (event) => { drawing = true; canvas.setPointerCapture(event.pointerId); const [x, y] = pos(event); ctx.beginPath(); ctx.moveTo(x, y); strokes += 1; CC.$('#lgm-hint', sh.el).hidden = true; CC.$('#lgm-limpar', sh.el).hidden = false; });
    canvas.addEventListener('pointermove', (event) => { if (!drawing) return; const [x, y] = pos(event); ctx.lineTo(x, y); ctx.stroke(); strokes += 1; ok.disabled = strokes < 3; });
    const end = () => { drawing = false; ok.disabled = strokes < 3; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    CC.$('#lgm-limpar', sh.el).addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); strokes = 0; ok.disabled = true; CC.$('#lgm-hint', sh.el).hidden = false; CC.$('#lgm-limpar', sh.el).hidden = true; });
    ok.addEventListener('click', async () => {
      const output = document.createElement('canvas'); output.width = canvas.width; output.height = canvas.height;
      const out = output.getContext('2d'); out.fillStyle = '#fff'; out.fillRect(0, 0, output.width, output.height); out.drawImage(canvas, 0, 0);
      const body = { dataHora: new Date().toISOString(), client_id: queuedId(receiptId), assinatura: { conteudoBase64: output.toDataURL('image/png') } };
      try {
        await CC.queue.add({ client_id: body.client_id, op: 'logistica-assinatura', reciboId: Number(receiptId), rotulo: `Assinatura da ficha ${receiptId}`, body });
        sh.close(); CC.toast(CC.offline() ? 'Sem internet · assinatura salva no celular' : 'Assinatura registrada'); CC.go('meu-kit');
      } catch (error) { CC.toast(error.message || 'Não foi possível salvar a assinatura'); }
    });
  }

  function textoSheet(id, titulo, label, enviar) {
    const sh = CC.sheet('lgm-sheet', `${CC.sheetHead('warning-circle', titulo)}<label class="field"><span>${label}</span><textarea id="lgm-relato" maxlength="2000" rows="4" required></textarea></label><button class="btn lgm-full" type="button" id="lgm-enviar">Enviar para Logística</button>`);
    CC.$('#lgm-enviar', sh.el).addEventListener('click', async () => {
      const relato = CC.$('#lgm-relato', sh.el).value.trim();
      if (relato.length < 5) return CC.toast('Descreva o ocorrido em pelo menos 5 caracteres');
      try { await enviar(id, relato); sh.close(); CC.toast('Enviado para a Logística'); CC.go('meu-kit'); }
      catch (error) { CC.toast(error.message || 'Não foi possível enviar'); }
    });
  }

  function relatarFalta(id) { textoSheet(id, 'Relatar falta', 'O que aconteceu com esta ferramenta?', (ferramentaId, relato) => CC.api('/logistica/faltas', { method: 'POST', body: { ferramentaId: Number(ferramentaId), relato } })); }
  function relatarDivergencia(id) { textoSheet(id, 'Informar divergência', 'O que está diferente na ficha?', (receiptId, relato) => CC.api(`/logistica/entregas/${receiptId}/divergencia`, { method: 'POST', body: { relato } })); }
})(window.CC = window.CC || {});
