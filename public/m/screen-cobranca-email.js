// E-mail ao cliente de uma cobranca: rascunho, autorizacao e envio com a NF em PDF (ate 5 MB).
// Mesmas rotas e ordem do desktop (public/d/telas/cobranca-email.js): salva, autoriza e envia.
// Servidor: ler e salvar rascunho exigem p6; autorizar e enviar exigem p7 (o desktop usa p5 para tudo).
(function (CC) {
  const { esc, icon } = CC;
  const B = CC.cobr;
  const F = CC.fin;
  const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  const lista = (t) => [...new Set(String(t || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const dataHora = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };
  const lerBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',').pop() || '');
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(blob);
  });
  // O rascunho padrao do Worker escreve o vencimento como AAAA-MM-DD; na mensagem vai dd/mm/aaaa.
  const suavizar = (d) => (d.status === 'draft' && !d.authorizedAt && !d.sentAt && /^Prezados,\s+Entramos em contato para acompanhamento financeiro/.test(d.bodyText || '')
    ? { ...d, bodyText: d.bodyText.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1') } : d);

  // NFs em PDF lancadas para o cliente na obra (aba Notas fiscais). Casa a obra pelo codigo.
  async function nfsDaObra(item) {
    try {
      const obras = (await CC.api('/centros-custo')).data || [];
      const obra = obras.find((o) => String(o.codigo).toLowerCase() === String(item.code).toLowerCase());
      if (!obra) return [];
      return ((await CC.api(`/centros-custo/${obra.id}/notas-fiscais?tipo=cliente`)).data || []).filter((n) => n.temArquivo);
    } catch { return []; }
  }

  async function anexo(page, nfs) {
    const escolha = CC.$('#ce-anexo', page).value;
    let blob, nome;
    if (escolha === 'arquivo') {
      const f = CC.$('#ce-arq', page).files[0];
      if (!f) throw new Error('Escolha o PDF da nota fiscal ou mude a opção de anexo.');
      blob = f; nome = f.name;
    } else if (escolha.startsWith('nf:')) {
      const nf = nfs.find((n) => String(n.id) === escolha.slice(3));
      const r = await fetch(`/api/centros-custo/notas-fiscais/${nf.id}/arquivo`, { headers: { Authorization: `Bearer ${CC.session.token()}` }, cache: 'no-store' });
      if (!r.ok) throw new Error('Não foi possível ler o PDF da nota fiscal.');
      blob = await r.blob(); nome = nf.nomeArquivo || `nota-fiscal-${nf.id}.pdf`;
    } else return [];
    if (blob.size > 5 * 1024 * 1024) throw new Error('A nota fiscal em PDF deve ter no máximo 5 MB.');
    return [{ filename: nome, contentType: 'application/pdf', contentBase64: await lerBase64(blob) }];
  }

  function faixa(d) {
    const n = (cls, ic, t) => `<div class="note ${cls}">${icon(ic, 18)}<span>${esc(t)}</span></div>`;
    if (d.status === 'sent') return n('ok', 'check-circle', `Enviado em ${dataHora(d.sentAt)} · reenviar manda uma nova cópia`);
    if (d.status === 'sending') return n('off', 'warning-circle', 'Envio sem confirmação. Após um minuto, escolha a mesma NF e tente confirmar de novo; confira o histórico antes de reenviar.');
    if (d.status === 'failed') return n('off', 'warning-circle', `O último envio falhou: ${d.lastError || 'erro desconhecido'}`);
    if (d.status === 'authorized') return n('ok', 'shield-check', `Autorizado por ${d.authorizedByEmail || 'gestor'} em ${dataHora(d.authorizedAt)}`);
    return '';
  }

  CC.screens['cobranca-email'] = async function (params) {
    const id = String((params && params.id) || '');
    const voltar = () => CC.go('cobranca', { id });
    const el = F.carregando('E-mail ao cliente', '', voltar);
    let item, r;
    try {
      item = await B.abrirItem(id);
      if (item) r = (await CC.api(`${B.url(item)}/rascunho`)).data;
    } catch (error) {
      return CC.errorScreen(el, { status: error.status, message: error.status === 0 ? 'Sem internet. O rascunho abre quando a conexão voltar.' : error.message }, () => CC.screens['cobranca-email'](params));
    }
    if (!item) { CC.toast('Esta cobrança não está mais na lista.', 'warning-circle'); return CC.go('cobrancas'); }
    await F.perms();
    const envia = F.can('p7');
    const nfs = envia ? await nfsDaObra(item) : [];
    const d = suavizar((r && r.draft) || {});
    const fixos = ((r && r.copyPolicy && r.copyPolicy.emails) || []).map((e) => String(e).toLowerCase());
    const extras = (d.cc || []).filter((e) => !fixos.includes(String(e).toLowerCase()));
    const pendente = d.status === 'sending';
    const rotEnviar = pendente ? 'Confirmar envio pendente' : (d.status === 'sent' ? 'Reenviar e-mail' : 'Enviar e-mail');
    const page = CC.render(`${F.top('E-mail ao cliente', `${item.code} · ${item.name}`)}${faixa(d)}
      <label class="field"><span>Para</span><input id="ce-to" type="email" multiple autocapitalize="off" spellcheck="false" value="${esc((d.to || []).join(', '))}" placeholder="cliente@empresa.com.br"></label>
      <label class="field"><span>Cópia (opcional)</span><input id="ce-cc" autocapitalize="off" spellcheck="false" value="${esc(extras.join(', '))}"></label>
      ${fixos.length ? `<p class="sub fin-nota">Sempre em cópia: ${esc(fixos.join(', '))}</p>` : ''}
      ${F.campo('Assunto', 'ce-assunto', d.subject, ' maxlength="300"')}
      <label class="field"><span>Mensagem</span><textarea id="ce-msg" rows="9">${esc(d.bodyText || '')}</textarea></label>
      ${envia ? `<label class="field"><span>Anexo · nota fiscal em PDF</span><select id="ce-anexo">
          ${nfs.map((n) => `<option value="nf:${esc(n.id)}">${esc(`${n.nomeArquivo || 'nota.pdf'} · ${n.observacao || 'NF'} · ${CC.money(n.valor)}`)}</option>`).join('')}
          <option value="vinculada">Usar a NF vinculada à obra (cadastro antigo)</option><option value="arquivo">Outro PDF do celular</option></select></label>
        <input id="ce-arq" type="file" accept="application/pdf,.pdf" hidden>
        <p class="sub fin-nota">${nfs.length ? 'Uma NF em PDF por envio, até 5 MB.' : 'Nenhuma NF em PDF lançada para o cliente nesta obra. Lance na obra (aba Notas fiscais) ou escolha um PDF.'}</p>
        <label class="menu-item pref"><span>Autorizo o envio deste e-mail ao cliente</span><input type="checkbox" id="ce-ok"></label>`
        : `<div class="note ok">${icon('info', 18)}<span>Você pode salvar o rascunho. Autorizar e enviar fica para quem tem a permissão de autorizar envios.</span></div>`}
      <p class="alert" role="alert" id="err"></p>
      <div class="actions"><button class="btn2" type="button" id="ce-salvar"${pendente ? ' disabled' : ''}>Salvar rascunho</button>
        ${envia ? `<button class="btn" type="button" id="ce-enviar" disabled>${icon('paper-plane-right', 18)}${esc(rotEnviar)}</button>` : ''}</div>`, true, params);
    document.body.classList.add('no-tabs');
    F.voltar(page, voltar);
    const base = B.url(item);
    const recarregar = () => CC.screens['cobranca-email']({ id, __nav: params.__nav });
    const ler = () => ({ to: lista(CC.$('#ce-to', page).value), cc: lista(CC.$('#ce-cc', page).value), subject: CC.$('#ce-assunto', page).value.trim(), bodyText: CC.$('#ce-msg', page).value.trim() });
    const validar = (v) => {
      if (!v.to.length) return 'Informe pelo menos um e-mail de destinatário.';
      const ruim = v.to.concat(v.cc).find((e) => !EMAIL.test(e));
      if (ruim) return `E-mail inválido: ${ruim}`;
      if (!v.subject) return 'Informe o assunto.';
      if (v.bodyText.length < 5) return 'Escreva a mensagem.';
      return '';
    };
    const bSalvar = CC.$('#ce-salvar', page);
    bSalvar.addEventListener('click', async () => {
      const v = ler();
      const msg = validar(v);
      if (msg) return F.erro(page, msg);
      F.erro(page, '');
      CC.busy(bSalvar, 'Salvando…');
      try { await CC.api(`${base}/rascunho`, { method: 'PUT', body: v }); } catch (error) {
        bSalvar.disabled = false; bSalvar.textContent = 'Salvar rascunho';
        return F.erro(page, error.status === 0 ? 'Sem internet. Salvar precisa da conexão.' : error);
      }
      CC.toast(envia ? 'Rascunho salvo · confirme a autorização para enviar' : 'Rascunho salvo');
      return recarregar();
    });
    if (!envia) return undefined;
    const sel = CC.$('#ce-anexo', page), arq = CC.$('#ce-arq', page), marca = CC.$('#ce-ok', page), bEnviar = CC.$('#ce-enviar', page);
    sel.addEventListener('change', () => { arq.hidden = sel.value !== 'arquivo'; if (!arq.hidden) arq.click(); });
    marca.addEventListener('change', () => { bEnviar.disabled = !marca.checked; });
    bEnviar.addEventListener('click', async () => {
      if (!marca.checked) return undefined;
      const v = ler();
      const msg = validar(v);
      if (msg) return F.erro(page, msg);
      F.erro(page, '');
      CC.busy(bEnviar, 'Enviando…');
      bSalvar.disabled = true;
      try {
        const anexos = await anexo(page, nfs);
        if (!pendente) {
          await CC.api(`${base}/rascunho`, { method: 'PUT', body: v }); // 1. salva o que esta na tela
          await CC.api(`${base}/autorizar`, { method: 'POST', body: { confirmar: true } }); // 2. salvar zera a autorizacao
        }
        const envio = await CC.api(`${base}/enviar`, { method: 'POST', body: { attachments: anexos } }); // 3. envia
        B.lista = []; // o Worker muda a situacao: o detalhe le a lista de novo
        CC.toast('E-mail enviado ao cliente');
        if (envio.data && envio.data.postSendWarning) {
          F.solta(bEnviar, 'paper-plane-right', rotEnviar); bEnviar.disabled = true;
          return F.erro(page, 'E-mail enviado, mas o histórico ou a situação da cobrança não pôde ser atualizado. Confira o acompanhamento; não reenvie.');
        }
        return recarregar();
      } catch (error) {
        try { const atual = (await CC.api(`${base}/rascunho`)).data; if (atual.draft && atual.draft.status === 'sending') return recarregar(); } catch { /* confere ao abrir de novo */ }
        F.solta(bEnviar, 'paper-plane-right', rotEnviar); bEnviar.disabled = !marca.checked; bSalvar.disabled = pendente;
        return F.erro(page, error.status === 0 ? 'Sem internet. Não foi possível confirmar o envio; confira o rascunho antes de tentar de novo.' : error);
      }
    });
    return undefined;
  };
})(window.CC = window.CC || {});
