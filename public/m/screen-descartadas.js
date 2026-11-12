// Menu › Obras descartadas (so admin): lista, detalhe e recuperar. Prototipo: Rodada 26 (odesc, odescDet, odescVazio, ro*).
(function (CC) {
  const { esc, icon } = CC;
  const top = (title, sub) => `<div class="top"><button class="back" type="button" id="voltar" aria-label="Voltar">${icon('caret-left', 20)}</button>
    <span class="grow"><h1>${esc(title)}</h1>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</span></div>`;
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const guardadas = (list) => list.filter((d) => !d.restored_at);

  // Contador do item do Menu; guardado na memoria da sessao da pagina.
  CC.loadDescartadasCount = async function () {
    if (CC.descartadasCount !== undefined) return CC.descartadasCount;
    try {
      const { data } = await CC.cached('descartadas', '/centros-custo/descartadas');
      CC.descartadasCount = guardadas(Array.isArray(data) ? data : []).length;
    } catch { CC.descartadasCount = null; }
    return CC.descartadasCount;
  };

  async function load(params) {
    if (params && params.lista) return { data: params.lista, stale: false };
    return CC.cached('descartadas', '/centros-custo/descartadas');
  }

  CC.screens.descartadas = async function (params) {
    const back = (el) => CC.$('#voltar', el).addEventListener('click', () => CC.go('menu'));
    const el = CC.render(`${top('Obras descartadas')}<div class="skeleton"></div><div class="skeleton"></div>`, true, params);
    back(el);
    let result;
    try { result = await load(params); } catch (error) { return CC.errorScreen(el, error, () => CC.screens.descartadas(params)); }
    const list = guardadas(Array.isArray(result.data) ? result.data : []);
    CC.descartadasCount = list.length;
    const sub = list.length ? `${list.length} ${list.length > 1 ? 'obras guardadas' : 'obra guardada'} · só o administrador vê` : 'Só o administrador vê';
    const page = CC.render(`${top('Obras descartadas', sub)}${CC.staleNote(result)}
      ${list.length ? '<div class="od-bar"><small class="muted" data-cont></small><button class="btn2 od-selbtn" type="button" data-selecionar></button></div>' : ''}
      <div data-lista></div><div data-acoes></div>`, true, params);
    back(page);
    const sel = new Set();
    let selecionando = false;
    const linha = (d) => `<button type="button" class="suite-item od-row${selecionando && sel.has(String(d.id)) ? ' on' : ''}" data-id="${esc(d.id)}"${selecionando ? ` role="checkbox" aria-checked="${sel.has(String(d.id))}"` : ''}>${selecionando ? `<span class="od-chk">${sel.has(String(d.id)) ? icon('check', 16) : ''}</span>` : icon('archive', 22)}
        <span><b>${esc(d.name)}</b><small>${esc([d.code, d.cliente].filter(Boolean).join(' · '))}</small>
        <small>Descartada por ${esc(d.discarded_by_name || 'administrador')} · ${esc(when(d.discarded_at))}</small></span>${selecionando ? '' : icon('caret-right', 18)}</button>`;
    const pintar = () => {
      const cont = CC.$('[data-cont]', page);
      if (cont) cont.textContent = selecionando ? (sel.size ? `${sel.size} selecionada${sel.size > 1 ? 's' : ''}` : 'Toque nas obras para marcar') : '';
      const botao = CC.$('[data-selecionar]', page);
      if (botao) botao.textContent = selecionando ? 'Cancelar' : 'Selecionar';
      CC.$('[data-lista]', page).innerHTML = list.length ? `<div class="rows">${list.map(linha).join('')}</div>`
        : `<div class="empty">${icon('archive', 28)}<b style="color:var(--text)">Nenhuma obra descartada</b>Quando um administrador descartar uma obra, ela fica guardada aqui e pode ser recuperada.</div>`;
      CC.$('[data-acoes]', page).innerHTML = selecionando ? `<div class="od-selbar"><button class="btn2" type="button" data-todas>${sel.size === list.length ? 'Limpar' : 'Marcar todas'}</button>
        <button class="btn danger" type="button" data-excluir${sel.size ? '' : ' disabled'}>${icon('trash', 18)}Excluir${sel.size ? ` (${sel.size})` : ''}</button></div>` : '';
    };
    page.addEventListener('click', (event) => {
      const t = event.target;
      if (t.closest('[data-selecionar]')) { selecionando = !selecionando; sel.clear(); pintar(); return; }
      if (t.closest('[data-todas]')) { if (sel.size === list.length) sel.clear(); else list.forEach((d) => sel.add(String(d.id))); pintar(); return; }
      if (t.closest('[data-excluir]')) { excluirDeVez(list.filter((d) => sel.has(String(d.id))), result.data); return; }
      const b = t.closest('[data-id]');
      if (!b) return;
      if (selecionando) { if (!sel.delete(b.dataset.id)) sel.add(b.dataset.id); pintar(); return; }
      const d = list.find((x) => String(x.id) === b.dataset.id);
      if (d) CC.go('descartada', { d, lista: result.data });
    });
    pintar();
  };

  // Excluir de vez: o registro guardado some e a obra nao pode mais ser recuperada.
  function excluirDeVez(itens, _lista, error) {
    const uma = itens.length === 1;
    const sh = CC.sheet('obra-menu', `${CC.sheetHead('trash', uma ? `Excluir ${itens[0].code} de vez?` : `Excluir ${itens.length} obras de vez?`)}
      <p class="od-txt">${uma ? 'A obra guardada some' : 'As obras guardadas somem'} para sempre e não dá mais para recuperar.</p>
      ${error ? CC.sheetErr(error) : ''}
      <div class="grid2 od-acts"><button class="btn2" type="button" id="od-cancel">Cancelar</button>
        <button class="btn danger" type="button" id="od-go">${icon('trash', 18)}Excluir de vez</button></div>`);
    CC.$('#od-cancel', sh.el).addEventListener('click', sh.close);
    CC.$('#od-go', sh.el).addEventListener('click', async (e) => {
      CC.busy(e.currentTarget, 'Excluindo…');
      CC.$('#od-cancel', sh.el).disabled = true;
      try { await CC.api('/centros-custo/descartadas/excluir', { method: 'POST', body: { ids: itens.map((d) => Number(d.id)) } }); } catch (err) { sh.close(); return excluirDeVez(itens, _lista, err); }
      CC.descartadasCount = undefined;
      sh.close();
      CC.toast(uma ? `${itens[0].code} excluída de vez` : `${itens.length} obras excluídas de vez`);
      CC.go('descartadas');
    });
  }

  CC.screens.descartada = function (params) {
    const d = params && params.d;
    if (!d) return CC.go('descartadas');
    const kv = [['Cliente', d.cliente || 'Não informado'], ['Contrato', d.contrato_numero || (d.tinha_contrato ? 'Sim' : 'Nenhum')],
      ['Valor do contrato', Number(d.valor_contrato) > 0 ? CC.money(d.valor_contrato) : 'Não informado'],
      ['Descartada por', d.discarded_by_name || 'Administrador'], ['Quando', when(d.discarded_at)]];
    const page = CC.render(`${top(d.code, d.name)}
      <div class="card">${kv.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      <span class="label">Motivo</span><div class="card"><span class="${d.reason ? '' : 'muted'}">${esc(d.reason || 'Sem motivo informado.')}</span></div>
      <div class="actions"><button class="btn" type="button" id="recuperar">${icon('arrow-counter-clockwise', 18)}Recuperar obra</button>
        <button class="btn2" type="button" id="excluir-vez">${icon('trash', 18)}Excluir de vez</button></div>`, true, params);
    CC.$('#voltar', page).addEventListener('click', () => CC.go('descartadas'));
    CC.$('#recuperar', page).addEventListener('click', () => recuperar(d));
    CC.$('#excluir-vez', page).addEventListener('click', () => excluirDeVez([d], params.lista));
  };

  function recuperar(d, error) {
    const sh = CC.sheet('obra-menu', `${CC.sheetHead('arrow-counter-clockwise', `Recuperar ${d.code}?`)}
      <p class="od-txt">Volta a obra ${esc(d.name)}${d.tinha_contrato ? ', com o contrato e a base de custo' : ''}. Ela aparece de novo em Obras.</p>
      ${error ? CC.sheetErr(error) : ''}
      <div class="grid2 od-acts"><button class="btn2" type="button" id="od-cancel">Cancelar</button>
        <button class="btn" type="button" id="od-go">${icon('arrow-counter-clockwise', 18)}Recuperar obra</button></div>`);
    CC.$('#od-cancel', sh.el).addEventListener('click', sh.close);
    CC.$('#od-go', sh.el).addEventListener('click', async (e) => {
      CC.busy(e.currentTarget, 'Recuperando…');
      CC.$('#od-cancel', sh.el).disabled = true;
      let id;
      try { id = (await CC.api(`/centros-custo/descartadas/${encodeURIComponent(d.id)}/restaurar`, { method: 'POST', body: {} })).data.id; } catch (err) { return recuperar(d, err); }
      CC.descartadasCount = undefined;
      CC.toast(`${d.code} voltou para Obras`);
      sh.set(CC.sheetDone(`${d.code} recuperada`, d.tinha_contrato ? 'A obra voltou para Obras com o contrato e a base de custo.' : 'A obra voltou para Obras.',
        `<div class="grid2 od-acts"><button class="btn2" type="button" id="od-list">Fechar</button><button class="btn" type="button" id="od-open">${icon('buildings', 18)}Abrir obra</button></div>`));
      CC.$('#od-list', sh.el).addEventListener('click', sh.close);
      CC.$('#od-open', sh.el).addEventListener('click', () => { sh.close(); CC.go('obra', { id }); });
      CC.go('descartadas');
    });
  }
})(window.CC = window.CC || {});
