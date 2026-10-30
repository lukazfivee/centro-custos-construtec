(function (CC) {
  const D = CC.d, U = D.ui, esc = CC.esc;
  async function render(el, rota, vivo) {
    if (!D.tem('p2')) { el.innerHTML = `<div class="pagina">${U.faixa('err','warning-circle','Você não tem permissão para importar lançamentos.')}</div>`; return; }
    el.innerHTML = `<div class="pagina"><div class="cab"><div><div class="grupo">Operação</div><h1>Importar do WhatsApp</h1><p>Cole a mensagem de controle de custos. Os itens identificados serão lançados como pendentes.</p></div></div>
      <div class="card" style="padding:24px"><label for="whatsapp-texto">Mensagem</label><textarea id="whatsapp-texto" rows="14" maxlength="20000" style="display:block;width:100%;margin:12px 0" placeholder="Cole a mensagem aqui"></textarea>
      <p>O texto será enviado ao serviço de IA para identificar os itens.</p><button type="button" class="btn btn-p" data-importar>Importar</button></div><div data-resultado aria-live="polite"></div><section class="card" style="padding:24px;margin-top:16px"><h2>Importações recentes</h2><div data-historico>Carregando…</div></section></div>`;
    const input = CC.$('#whatsapp-texto',el), button = CC.$('[data-importar]',el), result = CC.$('[data-resultado]',el);
    async function historico() {
      const target = CC.$('[data-historico]',el);
      try {
        const rows = (await CC.api('/importacoes/whatsapp')).data;
        if (!vivo()) return;
        target.innerHTML = rows.length ? rows.map(row => `<p><button type="button" class="btn btn-s" data-historico-id="${esc(row.id)}">Ver importação de ${esc(new Date(row.created_at).toLocaleString('pt-BR'))}</button></p>`).join('') : '<p>Nenhuma importação recente.</p>';
        CC.$$('[data-historico-id]',target).forEach(b => b.addEventListener('click', async () => {
          try { const data = (await CC.api(`/importacoes/whatsapp/${encodeURIComponent(b.dataset.historicoId)}`)).data; if (vivo()) mostrar(data, true); }
          catch (error) { CC.toast(error.message,'warning'); }
        }));
      } catch (error) { if (vivo()) target.textContent = 'Não foi possível carregar o histórico.'; }
    }
    historico();
    button.addEventListener('click', async () => {
      const texto = input.value;
      if (!texto.trim()) { CC.toast('Cole uma mensagem para importar.', 'warning'); return; }
      button.disabled = true; result.innerHTML = U.carregando('Identificando e lançando os itens…');
      try {
        const cats = (await CC.api('/categorias')).data.filter(c => c.ativo && ['despesa','ambos'].includes(c.tipo));
        const itens = await CC.whatsappIA.extrair(texto, cats.map(c => ({id:c.id,nome:c.nome})));
        const {data} = await CC.api('/importacoes/whatsapp',{method:'POST',body:{texto,itens}});
        if (!vivo()) return;
        mostrar(data); historico();
      } catch (error) { if (vivo()) result.innerHTML = U.faixa('err','warning-circle',error.message || 'Não foi possível importar.'); }
      finally { button.disabled = false; }
    });
    function mostrar(data, anterior = false) {
      const lancados = data.lancados.map(l => `<li>${esc(l.descricao || 'Lançamento já importado')} ${l.centro ? `— ${esc(l.centro)}` : ''}${l.valor != null ? ` — ${esc(Number(l.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}` : ''}${l.excluido ? ' (desfeito)' : l.replayed ? ' (já importado)' : ''}${l.itemId && !l.excluido ? ` <button type="button" class="btn btn-s" data-item="${Number(l.itemId)}">Desfazer</button>` : ''}</li>`).join('');
      const pendencias = data.pendencias.map(p => `<li>Linha ${esc(p.linha ?? '—')}: ${esc(p.motivo)}</li>`).join('');
      const centros = data.centrosCriados.map(c => `<li>${esc(c.nome)}</li>`).join('');
      result.innerHTML = `<section class="card" style="padding:24px;margin-top:16px"><h2>Resultado</h2>${anterior ? '<p>Resultado registrado na importação.</p>' : ''}<h3>Lançamentos (${data.lancados.length})</h3><ul>${lancados || '<li>Nenhum lançamento novo.</li>'}</ul><h3>Pendências (${data.pendencias.length})</h3><ul>${pendencias || '<li>Nenhuma pendência.</li>'}</ul>${anterior && data.texto && data.pendencias.length ? '<button type="button" class="btn btn-s" data-reprocessar>Usar mensagem original</button><p>Use a mensagem original para tentar novamente sem duplicar os lançamentos já feitos.</p>' : ''}<h3>Centros criados</h3><ul>${centros || '<li>Nenhum centro novo.</li>'}</ul>${data.lancados.some(l => l.itemId && !l.excluido) ? '<button type="button" class="btn btn-s" data-desfazer>Desfazer importação</button>' : ''}</section>`;
      async function undo(itemId) {
        if (!await D.confirmar({titulo:'Desfazer lançamento?',texto:'Os lançamentos pendentes em competência aberta serão enviados para a lixeira.',ok:'Desfazer',tom:'aviso'})) return;
        try {
          const suffix = itemId ? `/itens/${itemId}` : '';
          const r = (await CC.api(`/importacoes/whatsapp/${encodeURIComponent(data.importId)}${suffix}`,{method:'DELETE'})).data;
          CC.toast(`${r.removidos} lançamento(s) desfeito(s).${r.centrosInativados.length ? ` ${r.centrosInativados.length} centro(s) inativado(s).` : ''}${r.pendencias.length ? ' Há itens que não puderam ser desfeitos.' : ''}`);
          if (vivo()) { result.innerHTML = ''; historico(); }
        } catch (error) { CC.toast(error.message,'warning'); }
      }
      const reprocessar = CC.$('[data-reprocessar]',result);
      if (reprocessar) reprocessar.addEventListener('click', () => { input.value = data.texto; input.focus(); input.scrollIntoView({behavior:'smooth',block:'center'}); });
      const all = CC.$('[data-desfazer]',result); if (all) all.addEventListener('click', () => undo());
      CC.$$('[data-item]',result).forEach(b => b.addEventListener('click', () => undo(b.dataset.item)));
    }
  }
  D.tela('importar-whatsapp',{render});
})(window.CC);
