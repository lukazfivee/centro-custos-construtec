// Menu › Importar do WhatsApp: cola a mensagem de controle de custos, a IA identifica os itens e o servidor
// lanca como pendentes. Mesmas rotas e a mesma extracao do desktop (public/d/telas/importar-whatsapp.js e
// public/m/ia-whatsapp.js, o mesmo arquivo que o desktop carrega). Exige p2, como no computador; o servidor confere de novo.
(function (CC) {
  const { esc, icon, money } = CC;
  const F = CC.fin;
  const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function resultadoHtml(data, anterior) {
    const lanc = data.lancados.map((l) => `<div class="row fin-row"><span class="line"><span class="grow name">${esc(l.descricao || 'Lançamento já importado')}</span>
        ${l.valor != null ? `<b class="fin-val">${esc(money(l.valor))}</b>` : ''}</span>
      <span class="cli">${esc([l.centro, l.excluido ? 'desfeito' : l.replayed ? 'já importado' : ''].filter(Boolean).join(' · ') || 'Sem obra')}</span>
      ${l.itemId && !l.excluido ? `<button class="btn2" type="button" data-item="${Number(l.itemId)}">${icon('arrow-counter-clockwise', 18)}Desfazer este</button>` : ''}</div>`).join('');
    const pend = data.pendencias.map((p) => `<div class="kv"><span>Linha ${esc(p.linha == null ? '—' : p.linha)}</span><b>${esc(p.motivo)}</b></div>`).join('');
    const centros = data.centrosCriados.map((c) => `<div class="kv"><span>Obra criada</span><b>${esc(c.nome)}</b></div>`).join('');
    return `<span class="label">${anterior ? 'Resultado registrado na importação' : 'Resultado'}</span>
      <div class="kv lanc-total"><span>${esc(F.plural(data.lancados.length, 'lançamento', 'lançamentos'))}</span><b>${esc(F.plural(data.pendencias.length, 'pendência', 'pendências'))}</b></div>
      ${lanc ? `<div class="rows">${lanc}</div>` : `<div class="empty">${icon('list-bullets', 28)}Nenhum lançamento novo.</div>`}
      ${pend ? `<span class="label">Não foi possível lançar</span><div class="card">${pend}</div>` : ''}
      ${centros ? `<div class="card">${centros}</div>` : ''}
      ${anterior && data.texto && data.pendencias.length ? `<button class="btn2" type="button" id="iw-reusar">${icon('arrow-clockwise', 18)}Usar a mensagem original</button>
        <small class="muted">Tenta de novo sem duplicar o que já foi lançado.</small>` : ''}
      ${data.lancados.some((l) => l.itemId && !l.excluido) ? `<button class="btn2" type="button" id="iw-desfazer">${icon('arrow-counter-clockwise', 18)}Desfazer a importação inteira</button>` : ''}`;
  }

  CC.screens['importar-whatsapp'] = async function (params) {
    const voltar = () => CC.go('menu');
    await F.perms();
    if (!F.can('p2')) {
      const semAcesso = CC.render(`${F.top('Importar do WhatsApp', '')}<div class="empty">${icon('shield-check', 28)}Você não tem permissão para importar lançamentos.</div>`, true, params);
      F.voltar(semAcesso, voltar);
      return undefined;
    }
    const page = CC.render(`${F.top('Importar do WhatsApp', 'Os itens entram como lançamentos pendentes')}
      <label class="field"><span>Mensagem</span><textarea id="iw-texto" rows="8" maxlength="20000" placeholder="Cole aqui a mensagem de controle de custos"></textarea></label>
      <small class="muted">O texto é enviado ao serviço de IA para identificar os itens.</small>
      <p class="alert" role="alert" id="err"></p>
      <div class="actions"><button class="btn" type="button" id="iw-importar">${icon('download-simple', 18)}Importar</button></div>
      <div id="iw-resultado" aria-live="polite"></div>
      <span class="label">Importações recentes</span><div id="iw-historico"><div class="skeleton"></div></div>`, true, params);
    F.voltar(page, voltar);
    const vivo = () => document.body.contains(page) && CC.current() === 'importar-whatsapp';
    const input = CC.$('#iw-texto', page), botao = CC.$('#iw-importar', page), resultado = CC.$('#iw-resultado', page);
    let original = null;

    async function historico() {
      const slot = CC.$('#iw-historico', page);
      try {
        const rows = (await CC.api('/importacoes/whatsapp')).data;
        if (!vivo()) return;
        slot.innerHTML = rows.length ? `<div class="rows">${rows.map((r) => `<button type="button" class="row fin-row" data-imp="${esc(r.id)}">
          <span class="line"><span class="grow name">Importação de ${esc(quando(r.created_at))}</span>${icon('caret-right', 18)}</span></button>`).join('')}</div>`
          : `<div class="empty">${icon('list-bullets', 28)}Nenhuma importação recente.</div>`;
        CC.$$('[data-imp]', slot).forEach((b) => b.addEventListener('click', async () => {
          try { const data = (await CC.api(`/importacoes/whatsapp/${encodeURIComponent(b.dataset.imp)}`)).data; if (vivo()) mostrar(data, true); }
          catch (error) { CC.toast(error.status === 0 ? 'Sem internet para abrir a importação.' : error.message, 'warning-circle'); }
        }));
      } catch (error) {
        if (!vivo()) return;
        slot.innerHTML = `<button class="btn2" type="button" id="iw-de-novo">${icon('arrow-clockwise', 18)}Tentar de novo</button>`;
        CC.$('#iw-de-novo', slot).addEventListener('click', historico);
      }
    }

    function desfazer(data, itemId) {
      const s = CC.sheet('iw-sheet', `${CC.sheetHead('arrow-counter-clockwise', itemId ? 'Desfazer este lançamento?' : 'Desfazer a importação?')}
        <small class="muted">Os lançamentos pendentes em mês aberto vão para a lixeira.</small><div id="iw-sheet-err"></div>
        <div class="actions"><button class="btn danger" type="button" id="iw-sim">${icon('arrow-counter-clockwise', 18)}Desfazer</button></div>`);
      CC.$('#iw-sim', s.el).addEventListener('click', async (event) => {
        const b = event.currentTarget;
        CC.busy(b, 'Desfazendo…');
        try {
          const r = (await CC.api(`/importacoes/whatsapp/${encodeURIComponent(data.importId)}${itemId ? `/itens/${itemId}` : ''}`, { method: 'DELETE' })).data;
          s.close();
          CC.toast(`${F.plural(r.removidos, 'lançamento desfeito', 'lançamentos desfeitos')}${r.pendencias.length ? '. Alguns itens não puderam ser desfeitos' : ''}`);
          if (vivo()) { resultado.innerHTML = ''; historico(); }
        } catch (error) { CC.$('#iw-sheet-err', s.el).innerHTML = CC.sheetErr(error); F.solta(b, 'arrow-counter-clockwise', 'Desfazer'); }
      });
    }

    function mostrar(data, anterior) {
      resultado.innerHTML = resultadoHtml(data, anterior);
      const reusar = CC.$('#iw-reusar', resultado);
      if (reusar) reusar.addEventListener('click', () => { original = data.texto; input.value = data.texto; input.scrollIntoView({ block: 'center', behavior: 'smooth' }); input.focus(); });
      const tudo = CC.$('#iw-desfazer', resultado);
      if (tudo) tudo.addEventListener('click', () => desfazer(data));
      CC.$$('[data-item]', resultado).forEach((b) => b.addEventListener('click', () => desfazer(data, b.dataset.item)));
      resultado.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    botao.addEventListener('click', async () => {
      const texto = original !== null && input.value === original ? original : input.value.trim();
      F.erro(page, '');
      if (!texto.trim()) { F.erro(page, 'Cole a mensagem no campo Mensagem.'); input.focus(); return; }
      if (!CC.whatsappIA) { F.erro(page, 'Sem internet. A importação precisa da conexão.'); return; }
      CC.busy(botao, 'Identificando os itens…');
      try {
        const cats = (await CC.api('/categorias')).data.filter((c) => c.ativo && ['despesa', 'ambos'].includes(c.tipo));
        const itens = await CC.whatsappIA.extrair(texto, cats.map((c) => ({ id: c.id, nome: c.nome })));
        const { data } = await CC.api('/importacoes/whatsapp', { method: 'POST', body: { texto, itens } });
        if (!vivo()) return;
        mostrar(data, false);
        historico();
      } catch (error) { if (vivo()) F.erro(page, error); } finally { if (vivo()) F.solta(botao, 'download-simple', 'Importar'); }
    });
    historico();
    return undefined;
  };
})(window.CC = window.CC || {});
