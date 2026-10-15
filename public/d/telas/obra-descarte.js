// Descartar uma obra sem movimento financeiro (inclusive a vinda de orcamento aprovado) e recuperar obras
// descartadas. So administrador; o servidor confere tudo (routes/costCenterDiscard.js).
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const O = D.obras = D.obras || {};
  const { esc } = CC;

  O.descartar = async function (obra, depois) {
    const ctl = await D.painel.abrir({
      icone: 'trash', titulo: 'Descartar obra',
      sub: `${obra.codigo} · ${obra.nome}`,
      corpo: `${U.faixa('warn', 'warning', 'A obra sai da carteira, com o contrato, a base de custo e as medições. Só vale para obra sem lançamento ativo, nota fiscal nem recorrência. Fica guardada em "Obras descartadas" e pode ser recuperada.')}
        ${U.faixa('info', 'info', 'Se a obra veio do Orçamentos, a proposta de origem volta a "Aprovada sem Centro de Custo" no Orçamentos e volta a apontar para a obra se ela for recuperada.')}
        <div data-limpar></div>
        <form class="form-lanc" novalidate>
          ${U.campo({ rotulo: 'Motivo (opcional)', name: 'motivo', placeholder: 'Ex.: obra de teste' })}
          ${U.campo({ rotulo: `Digite o código da obra (${obra.codigo}) para confirmar`, name: 'confirmar', obrigatorio: true })}
        </form>`,
      rodape: '<button type="button" class="btn btn-s" data-fechar>Cancelar</button><button type="button" class="btn btn-d" data-confirmar>Descartar obra</button>',
    });
    if (!ctl) return;
    let ocupado = false;
    const enviar = async () => {
      if (ocupado) return;
      const body = Object.fromEntries(new FormData(CC.$('form', ctl.corpo)).entries());
      if (String(body.confirmar || '').trim().toLowerCase() !== String(obra.codigo).trim().toLowerCase()) {
        ctl.errosCampos({ confirmar: 'Digite o código exatamente como aparece.' });
        return;
      }
      ocupado = true;
      ctl.erro('');
      const cancelar = CC.$('[data-fechar]', ctl.rodape);
      if (cancelar) cancelar.disabled = true;
      const voltar = U.ocupar(CC.$('[data-confirmar]', ctl.rodape), 'Descartando…');
      try {
        await CC.api(`/centros-custo/${obra.id}/descartar`, { method: 'POST', body });
        ctl.marcarSalvo();
        ctl.fechar(true);
        CC.toast('Obra descartada. Dá para recuperar em "Obras descartadas".');
        await depois();
      } catch (error) { voltar(); ctl.erro(error.message); if (error.status === 409) oferecerLimpar(); }
      finally { ocupado = false; if (cancelar) cancelar.disabled = false; }
    };
    // Obra com movimento: oferece excluir de uma vez os lancamentos e recorrentes (vao para a lixeira).
    const oferecerLimpar = () => {
      const alvo = CC.$('[data-limpar]', ctl.corpo);
      alvo.innerHTML = `<div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <span>Para descartar, os lançamentos e os recorrentes desta obra precisam sair antes. Os lançamentos vão para a lixeira e são guardados junto com a obra; estornos e competências fechadas ficam como estão.</span>
        <button type="button" class="btn btn-s" data-limpar-ir style="align-self:flex-start">Excluir todos os lançamentos e recorrentes</button></div>`;
      CC.$('[data-limpar-ir]', alvo).addEventListener('click', async (ev) => {
        const botao = ev.currentTarget;
        const body = Object.fromEntries(new FormData(CC.$('form', ctl.corpo)).entries());
        if (String(body.confirmar || '').trim().toLowerCase() !== String(obra.codigo).trim().toLowerCase()) {
          ctl.errosCampos({ confirmar: 'Digite o código da obra para confirmar.' });
          return;
        }
        const sim = await D.confirmar({ titulo: `Excluir todos os lançamentos de ${obra.codigo}?`, texto: 'Os lançamentos vão para a lixeira e os modelos recorrentes desta obra são apagados. Estornos e competências fechadas não são mexidos.', ok: 'Excluir todos', tom: 'perigo', icone: 'trash' });
        if (!sim) return;
        const voltarL = U.ocupar(botao, 'Excluindo…');
        try {
          const { data } = await CC.api(`/centros-custo/${obra.id}/excluir-lancamentos`, { method: 'POST', body: { confirmar: body.confirmar } });
          const resto = Object.values(data.impedimentos || {}).reduce((a, n) => a + n, 0);
          ctl.erro('');
          alvo.innerHTML = U.faixa(resto ? 'warn' : 'info', resto ? 'warning' : 'check-circle',
            `${data.excluidos} lançamento(s) e ${data.recorrentes} recorrente(s) excluídos.${data.ignorados.length ? ` Ficaram ${data.ignorados.length}: ${data.ignorados.map((i) => `${i.descricao} (${i.motivo})`).join('; ')}.` : ''}${resto ? ' Ainda há registros que impedem o descarte (rateios, medições ou notas fiscais).' : ' Agora é só descartar.'}`);
        } catch (error) { voltarL(); ctl.erro(error.message); }
      });
    };
    CC.$('form', ctl.corpo).addEventListener('submit', (event) => { event.preventDefault(); enviar(); });
    CC.$('[data-confirmar]', ctl.rodape).addEventListener('click', enviar);
  };

  O.descartadas = async function (depois) {
    const { data } = await CC.api('/centros-custo/descartadas');
    const lista = Array.isArray(data) ? data : [];
    const linha = (d) => `<div class="usu-email" style="align-items:center;gap:12px"><input type="checkbox" data-sel="${esc(d.id)}" aria-label="Selecionar ${esc(d.code)}"><span style="flex:1"><b>${esc(d.code)}</b> · ${esc(d.name)}<br><small class="muted">${d.restored_at ? `Restaurada em ${esc(D.data(d.restored_at))}` : `Descartada em ${esc(D.data(d.discarded_at))} por ${esc(d.discarded_by_name || '')}`}${d.reason ? ` · ${esc(d.reason)}` : ''}</small></span>
      ${d.restored_at ? U.chip('Restaurada', 'ok') : `<button type="button" class="btn btn-s" data-restaurar="${esc(d.id)}">Restaurar</button>`}</div>`;
    const topo = `<div class="usu-email" style="align-items:center;gap:12px"><label style="display:flex;align-items:center;gap:10px;flex:1"><input type="checkbox" data-todas aria-label="Selecionar todas"><b data-contagem>Selecionar todas</b></label></div>`;
    const ctl = await D.painel.abrir({
      icone: 'arrow-counter-clockwise', titulo: 'Obras descartadas', sub: 'Restaurar devolve a obra, o contrato e a base de custo. Excluir permanentemente apaga o registro de vez.',
      corpo: lista.length ? `<div class="card usu-emails">${topo}${lista.map(linha).join('')}</div>` : U.vazio('buildings', 'Nenhuma obra descartada.'),
      rodape: `<button type="button" class="btn btn-s" data-fechar>Fechar</button>${lista.length ? `<button type="button" class="btn btn-d" data-excluir-sel disabled>${D.ic('trash')}Excluir selecionadas</button><button type="button" class="btn btn-d" data-excluir-todas>${D.ic('trash')}Excluir todas</button>` : ''}`,
    });
    if (!ctl) return;
    CC.$$('[data-restaurar]', ctl.corpo).forEach((b) => b.addEventListener('click', async () => {
      if (b.disabled) return;
      const voltar = U.ocupar(b, 'Restaurando…');
      try {
        await CC.api(`/centros-custo/descartadas/${b.dataset.restaurar}/restaurar`, { method: 'POST', body: {} });
        ctl.marcarSalvo();
        ctl.fechar(true);
        CC.toast('Obra restaurada');
        await depois();
      } catch (error) { voltar(); ctl.erro(error.message); }
    }));
    if (!lista.length) return;
    const caixas = CC.$$('[data-sel]', ctl.corpo);
    const todas = CC.$('[data-todas]', ctl.corpo);
    const botaoSel = CC.$('[data-excluir-sel]', ctl.rodape);
    const marcadas = () => caixas.filter((c) => c.checked).map((c) => Number(c.dataset.sel));
    const atualizar = () => {
      const n = marcadas().length;
      todas.checked = n === caixas.length;
      CC.$('[data-contagem]', ctl.corpo).textContent = n ? `${n} selecionada${n > 1 ? 's' : ''}` : 'Selecionar todas';
      botaoSel.disabled = !n;
    };
    todas.addEventListener('change', () => { caixas.forEach((c) => { c.checked = todas.checked; }); atualizar(); });
    caixas.forEach((c) => c.addEventListener('change', atualizar));
    const excluir = async (ids) => {
      const varias = ids.length > 1;
      const sim = await D.confirmar({
        titulo: varias ? `Excluir ${ids.length} obras descartadas?` : 'Excluir esta obra descartada?',
        texto: `${varias ? 'Os registros guardados somem' : 'O registro guardado some'} para sempre e a obra não poderá mais ser restaurada. Não é possível desfazer.`,
        ok: 'Excluir permanentemente', tom: 'perigo', icone: 'trash',
      });
      if (!sim) return;
      try {
        const { data } = await CC.api('/centros-custo/descartadas/excluir', { method: 'POST', body: { ids } });
        ctl.marcarSalvo();
        ctl.fechar(true);
        CC.toast(data.excluidas === 1 ? 'Obra descartada excluída para sempre.' : `${data.excluidas} obras descartadas excluídas para sempre.`);
        await O.descartadas(depois);
      } catch (error) { ctl.erro(error.message); }
    };
    botaoSel.addEventListener('click', () => excluir(marcadas()));
    CC.$('[data-excluir-todas]', ctl.rodape).addEventListener('click', () => excluir(caixas.map((c) => Number(c.dataset.sel))));
  };
})(window.CC);
