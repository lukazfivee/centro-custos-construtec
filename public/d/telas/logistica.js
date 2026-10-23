(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const { esc } = CC;
  let aba = 'resumo';
  let busca = '';
  let status = '';
  let reciboImpressao = null;

  const abas = [['resumo', 'Resumo'], ['ferramentas', 'Ferramentas'], ['kits', 'Kits dos técnicos'], ['faltas', 'Faltas'], ['movimentacoes', 'Movimentações'], ['materiais', 'Materiais'], ['solicitacoes', 'Solicitações']];
  const dataLocal = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';
  const tagStatus = (value) => `<span class="logi-tag ${value === 'disponivel' ? 'ok' : value === 'com_tecnico' ? 'out' : 'warn'}">${esc(value.replaceAll('_', ' '))}</span>`;
  const focarAba = (el, key) => {
    const button = [...el.querySelectorAll('.logi-abas [data-aba]')].find((item) => item.dataset.aba === key);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  function dialogoFormulario({ titulo, corpo, ok, aoEnviar }) {
    return new Promise((resolve) => {
      const anterior = document.activeElement;
      const camada = D.el(`<div class="dialogo-camada"><form class="card dialogo logi-dialogo" role="dialog" aria-modal="true" aria-labelledby="logi-dlg-titulo">
        <b id="logi-dlg-titulo">${esc(titulo)}</b>${corpo}<span class="erro-dlg faixa err" role="alert" hidden></span>
        <div class="bts"><button type="button" class="btn btn-s" data-cancelar>Cancelar</button><button type="submit" class="btn btn-p">${esc(ok)}</button></div>
      </form></div>`);
      const fechar = (feito) => { document.removeEventListener('keydown', teclas, true); camada.remove(); anterior?.focus?.(); resolve(feito); };
      const teclas = (event) => { if (event.key === 'Escape') { event.preventDefault(); fechar(false); } else D.prenderFoco(camada, event); };
      const form = CC.$('form', camada), error = CC.$('.erro-dlg', camada), botoes = CC.$$('button', form);
      CC.$('[data-cancelar]', form).addEventListener('click', () => fechar(false));
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); error.hidden = true; botoes.forEach((button) => { button.disabled = true; });
        try { await aoEnviar(form); fechar(true); }
        catch (err) { error.textContent = err.message || 'Não foi possível registrar'; error.hidden = false; botoes.forEach((button) => { button.disabled = false; }); }
      });
      document.addEventListener('keydown', teclas, true); document.body.appendChild(camada);
      CC.$('input,select,textarea', form)?.focus();
    });
  }

  async function render(el, rota, vivo) {
    if (!D.podeTela(rota.nome)) return D.telaEmConstrucao(el, rota, vivo);
    if (abas.some(([key]) => key === rota.id)) aba = rota.id;
    el.innerHTML = `<div class="pagina logi-pagina">${U.cabecalho({ grupo: 'Operação', titulo: 'Logística', acoes: `<button type="button" class="btn btn-s" data-nova-ferramenta>${D.ic('plus')}Cadastrar ferramenta</button><button type="button" class="btn btn-s" data-entrega>${D.ic('package')}Entregar ferramentas</button><button type="button" class="btn btn-p" data-conferencia>${D.ic('clipboard-text')}Conferência inicial</button>` })}
      <nav class="logi-abas" aria-label="Seções da logística">${abas.map(([key, label]) => `<button type="button" class="logi-aba ${aba === key ? 'ativa' : ''}" data-aba="${key}" aria-current="${aba === key ? 'page' : 'false'}">${label}</button>`).join('')}</nav>
      <div data-corpo>${U.carregando('Carregando a logística…')}</div><div data-print hidden></div></div>`;
    const atualizar = () => render(el, rota, vivo);
    el.querySelectorAll('.logi-abas [data-aba]').forEach((button) => button.addEventListener('click', () => { aba = button.dataset.aba; atualizar(); focarAba(el, aba); }));
    el.querySelector('[data-nova-ferramenta]').addEventListener('click', () => formularioFerramenta(el, atualizar));
    el.querySelector('[data-conferencia]').addEventListener('click', () => formularioConferencia(el, atualizar));
    el.querySelector('[data-entrega]').addEventListener('click', () => formularioEntrega(el, atualizar));
    try {
      const [resumo, ferramentas, kit, movimentacoes, materiais, pedidos, opcoes, movimentosMateriais, faltas, devolucoes] = await Promise.all([
        CC.api('/logistica/resumo'), CC.api('/logistica/ferramentas'), CC.api('/logistica/kits/padrao'), CC.api('/logistica/movimentacoes'),
        CC.api('/logistica/materiais'), CC.api('/logistica/materiais/solicitacoes'), CC.api('/logistica/materiais/opcoes-entrega'), CC.api('/logistica/materiais/movimentacoes'), CC.api('/logistica/faltas'), CC.api('/logistica/materiais/devolucoes-pendentes'),
      ]);
      if (!vivo()) return;
      if (aba === 'resumo') desenharResumo(el, resumo.data, materiais.data);
      else if (aba === 'ferramentas') desenharFerramentas(el, ferramentas.data, atualizar);
      else if (aba === 'kits') desenharKit(el, kit.data);
      else if (aba === 'faltas') desenharFaltas(el, faltas.data, atualizar);
      else if (aba === 'movimentacoes') desenharMovimentacoes(el, movimentacoes.data);
      else if (aba === 'materiais') desenharMateriais(el, materiais.data, movimentosMateriais.data, devolucoes.data, atualizar);
      else desenharSolicitacoes(el, pedidos.data, materiais.data, opcoes.data, atualizar);
    } catch (error) {
      if (vivo()) CC.$('[data-corpo]', el).innerHTML = U.faixa('err', 'warning-circle', error.message || 'Não foi possível carregar a logística.');
    }
    if (reciboImpressao && vivo()) imprimirRecibo(el, reciboImpressao);
  }

  function desenharResumo(el, r, materiais) {
    const itens = [['Disponíveis', r.disponiveis, 'check-circle'], ['Com técnicos', r.com_tecnicos, 'users'], ['Aguardando assinatura', r.aguardando_assinatura, 'signature'], ['Em avaliação', r.em_avaliacao, 'wrench'], ['Divergências', r.divergencias, 'warning-circle'], ['Abaixo do mínimo', materiais.filter((item) => item.estoque_baixo).length, 'warning']];
    CC.$('[data-corpo]', el).innerHTML = `<div class="logi-resumo">${itens.map(([label, value, icon]) => `<article class="card logi-indicador">${D.ic(icon)}<span>${esc(label)}</span><b>${Number(value) || 0}</b></article>`).join('')}</div>
      <section class="card logi-bloco"><div><h2>Próximas ações</h2><p>Registre entradas, entregas e conferências sem passar pelas telas financeiras.</p></div><div class="logi-acoes"><button type="button" class="btn btn-s" data-aba="ferramentas">Consultar inventário</button><button type="button" class="btn btn-s" data-aba="kits">Editar kit padrão</button></div></section>`;
    CC.$$('.logi-acoes [data-aba]', el).forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; render(el, { nome: 'logistica' }, () => true); focarAba(el, aba); }));
  }

  function desenharFerramentas(el, lista, atualizar) {
    const pintar = () => {
      const q = busca.trim().toLowerCase();
      const visiveis = lista.filter((item) => (!status || item.situacao === status) && (!q || [item.nome, item.codigo, item.localizacao].join(' ').toLowerCase().includes(q)));
      CC.$('[data-itens]', el).innerHTML = visiveis.length ? `<div class="logi-tabela-wrap"><table class="logi-tabela"><thead><tr><th>Ferramenta</th><th>Código</th><th>Situação</th><th>Local / responsável</th><th>Ações</th></tr></thead><tbody>${visiveis.map((item) => `<tr><td>${esc(item.nome)}</td><td>${esc(item.codigo)}</td><td>${tagStatus(item.situacao)}</td><td>${item.tecnico_id ? esc(item.tecnico) : esc(item.localizacao)}</td><td>${item.situacao === 'com_tecnico' ? `<button class="btn btn-s" data-devolver="${item.id}">Registrar devolução</button>` : ''}${item.situacao === 'em_avaliacao' ? `<button class="btn btn-s" data-avaliar="${item.id}">Avaliar</button>` : ''}<button class="btn btn-s" data-historico="${item.id}">Histórico</button></td></tr>`).join('')}</tbody></table></div>` : U.vazio('wrench', 'Nenhuma ferramenta encontrada.', 'Ajuste a busca ou cadastre uma unidade no inventário.');
      CC.$$('[data-devolver]', el).forEach((button) => button.addEventListener('click', async () => {
        dialogoFormulario({ titulo: 'Registrar devolução', ok: 'Registrar', corpo: '<label>Condição<select class="inp" name="condicao"><option value="boa">Boa</option><option value="avariada">Avariada</option></select></label><label>Observação da devolução (se houver avaria)<textarea class="inp" name="observacao" maxlength="500"></textarea></label>', aoEnviar: async (form) => {
          const condicao = form.elements.condicao.value, observacao = form.elements.observacao.value.trim();
          if (condicao === 'avariada' && !observacao) throw new Error('Descreva a avaria para continuar.');
          await CC.api(`/logistica/ferramentas/${button.dataset.devolver}/devolucao`, { method: 'POST', body: { condicao, observacao } }); CC.toast('Devolução registrada'); atualizar();
        } });
      }));
      CC.$$('[data-avaliar]', el).forEach((button) => button.addEventListener('click', async () => {
        dialogoFormulario({ titulo: 'Avaliar ferramenta', ok: 'Salvar avaliação', corpo: '<label>Resultado<select class="inp" name="resultado"><option value="reparada">Reparada</option><option value="baixada">Baixada</option></select></label><label>Reparo ou motivo da baixa<textarea class="inp" name="motivo" maxlength="500" required></textarea></label>', aoEnviar: async (form) => {
          await CC.api(`/logistica/ferramentas/${button.dataset.avaliar}/avaliacao`, { method: 'POST', body: { resultado: form.elements.resultado.value, motivo: form.elements.motivo.value.trim() } }); CC.toast('Avaliação registrada'); atualizar();
        } });
      }));
      CC.$$('[data-historico]', el).forEach((button) => button.addEventListener('click', async () => {
        const popup = window.open('', '_blank');
        if (!popup) return CC.toast('Permita abrir uma nova aba para imprimir o histórico.');
        try {
          const { data } = await CC.api(`/logistica/ferramentas/${button.dataset.historico}/historico`);
          popup.document.write(`<title>Histórico da ferramenta</title><h1>Histórico da ferramenta</h1><table border="1" cellpadding="8"><thead><tr><th>Data</th><th>Movimento</th><th>Responsável</th><th>Detalhe</th></tr></thead><tbody>${data.map((row) => `<tr><td>${esc(dataLocal(row.criado_em))}</td><td>${esc(row.tipo)}</td><td>${esc(row.ator || '—')}</td><td>${esc(JSON.stringify(row.detalhe))}</td></tr>`).join('')}</tbody></table><button onclick="print()">Imprimir</button>`);
          popup.document.close();
        } catch (error) { popup.close(); CC.toast(error.message || 'Falha ao abrir histórico'); }
      }));
      CC.$('[data-contagem]', el).textContent = `${visiveis.length} de ${lista.length} ferramentas`;
    };
    CC.$('[data-corpo]', el).innerHTML = `<section class="card logi-filtros"><label>Buscar<input class="inp" data-busca type="search" value="${esc(busca)}" placeholder="Nome ou código" aria-label="Buscar ferramenta"></label><label>Situação<select class="inp" data-status><option value="">Todas</option><option value="disponivel">Disponível</option><option value="com_tecnico">Com técnico</option><option value="em_avaliacao">Em avaliação</option><option value="baixada">Baixada</option></select></label><span data-contagem></span></section><section class="card" data-itens></section>`;
    CC.$('[data-busca]', el).addEventListener('input', (event) => { busca = event.target.value; pintar(); });
    CC.$('[data-status]', el).value = status;
    CC.$('[data-status]', el).addEventListener('change', (event) => { status = event.target.value; pintar(); });
    pintar();
  }

  function desenharFaltas(el, lista, atualizar) {
    CC.$('[data-corpo]', el).innerHTML = lista.length ? `<section class="card logi-tabela-wrap"><table class="logi-tabela"><thead><tr><th>Data</th><th>Técnico</th><th>Ferramenta</th><th>Relato</th><th>Apuração</th><th></th></tr></thead><tbody>${lista.map((item) => `<tr><td>${esc(dataLocal(item.criada_em))}</td><td>${esc(item.tecnico)}</td><td>${esc(item.ferramenta)} (${esc(item.codigo)})</td><td>${esc(item.relato)}</td><td>${esc(item.apuracao || 'Pendente')}</td><td><button class="btn btn-s" type="button" data-apurar="${item.id}">Registrar apuração</button></td></tr>`).join('')}</tbody></table><p>A ocorrência fica aberta até a reposição da ferramenta; a apuração preserva o histórico.</p></section>` : U.vazio('check-circle', 'Nenhuma falta pendente.', 'Faltas relatadas pelos técnicos aparecerão aqui.');
    CC.$$('[data-apurar]', el).forEach((button) => button.addEventListener('click', async () => {
      dialogoFormulario({ titulo: 'Registrar apuração da falta', ok: 'Salvar apuração', corpo: '<label>O que a Logística apurou?<textarea class="inp" name="apuracao" minlength="5" maxlength="2000" required></textarea></label>', aoEnviar: async (form) => {
        await CC.api(`/logistica/faltas/${button.dataset.apurar}/apuracao`, { method: 'POST', body: { apuracao: form.elements.apuracao.value.trim() } }); CC.toast('Apuração registrada'); atualizar();
      } });
    }));
  }

  function desenharKit(el, kit) {
    CC.$('[data-corpo]', el).innerHTML = `<section class="card logi-bloco"><div><h2>Kit padrão dos técnicos</h2><p>Defina o que cada kit deve conter. Extras individuais são registrados em cada entrega.</p></div><form data-kit-form><div class="logi-kit-lista" data-kit-lista>${kit.itens.map((item) => linhaKit(item.nome, item.quantidade)).join('')}</div><div class="logi-form-acoes"><button type="button" class="btn btn-s" data-adicionar>Adicionar item</button><button type="submit" class="btn btn-p">Salvar kit padrão</button></div></form></section>`;
    CC.$('[data-adicionar]', el).addEventListener('click', () => CC.$('[data-kit-lista]', el).insertAdjacentHTML('beforeend', linhaKit('', 1)));
    CC.$('[data-kit-form]', el).addEventListener('submit', async (event) => {
      event.preventDefault();
      const itens = [...el.querySelectorAll('[data-kit-item]')].map((row) => ({ nome: row.querySelector('[name="nome"]').value, quantidade: Number(row.querySelector('[name="quantidade"]').value) }));
      try { await CC.api('/logistica/kits/padrao', { method: 'PUT', body: { itens } }); CC.toast('Kit padrão atualizado'); render(el, { nome: 'logistica' }, () => true); }
      catch (error) { CC.toast(error.message || 'Não foi possível salvar o kit'); }
    });
    CC.$('[data-kit-lista]', el).addEventListener('click', (event) => { const button = event.target.closest('[data-remover]'); if (button) button.closest('[data-kit-item]').remove(); });
  }

  function linhaKit(nome, quantidade) {
    return `<div class="logi-kit-item" data-kit-item><label>Ferramenta<input class="inp" name="nome" value="${esc(nome)}" required maxlength="120"></label><label>Qtd.<input class="inp" name="quantidade" type="number" min="1" max="50" value="${quantidade}" required></label><button type="button" class="ibtn" data-remover aria-label="Remover item do kit">${D.ic('trash')}</button></div>`;
  }

  function desenharMovimentacoes(el, lista) {
    CC.$('[data-corpo]', el).innerHTML = lista.length ? `<div class="card logi-tabela-wrap"><table class="logi-tabela"><thead><tr><th>Data e hora</th><th>Movimento</th><th>Ferramenta</th><th>Técnico</th><th>Detalhe</th></tr></thead><tbody>${lista.map((item) => `<tr><td>${esc(dataLocal(item.criado_em))}</td><td>${esc(item.tipo.replaceAll('_', ' '))}</td><td>${esc(item.ferramenta || '—')} ${item.codigo ? `(${esc(item.codigo)})` : ''}</td><td>${esc(item.tecnico || '—')}</td><td>${esc(JSON.stringify(item.detalhe || {}))}</td></tr>`).join('')}</tbody></table></div>` : U.vazio('clock-counter-clockwise', 'Ainda não há movimentações.', 'As entradas e entregas aparecerão aqui.');
  }

  function desenharMateriais(el, lista, movimentos, devolucoes, atualizar) {
    CC.$('[data-corpo]', el).innerHTML = `<section class="card logi-bloco"><div><h2>Materiais de consumo</h2><p>Saldo atual, estoque mínimo e regra de retorno.</p></div><div class="logi-form-acoes"><button type="button" class="btn btn-s" data-novo>Cadastrar material</button><button type="button" class="btn btn-p" data-entrada ${lista.length ? '' : 'disabled'}>Registrar entrada</button></div></section>
      <form class="card logi-form" data-form hidden><h3>Novo material</h3><label>Nome<input class="inp" name="nome" required maxlength="120"></label><label>Unidade<input class="inp" name="unidade" placeholder="un, caixa, metro" required maxlength="24"></label><label>Saldo inicial<input class="inp" name="saldoInicial" type="number" min="0" step="0.001" value="0"></label><label>Estoque mínimo<input class="inp" name="estoqueMinimo" type="number" min="0" step="0.001" value="0"></label><label><input type="checkbox" name="exigeRetorno"> Exige devolução de sobra</label><button class="btn btn-p">Salvar material</button></form>
      <section class="card" data-lista>${lista.length ? `<div class="logi-tabela-wrap"><table class="logi-tabela"><thead><tr><th>Material</th><th>Saldo</th><th>Mínimo</th><th>Retorno</th><th>Ação</th></tr></thead><tbody>${lista.map((m) => `<tr><td>${esc(m.nome)}${m.estoque_baixo ? ' · estoque baixo' : ''}</td><td>${esc(m.saldo)} ${esc(m.unidade)}</td><td>${esc(m.estoque_minimo)}</td><td>${m.exige_retorno ? 'Sim' : 'Não'}</td><td><button type="button" class="btn btn-s" data-repor="${m.id}">Dar entrada</button></td></tr>`).join('')}</tbody></table></div>` : U.vazio('package', 'Nenhum material cadastrado.', 'Cadastre itens como RJ45, parafusos ou consumíveis.')}</section>
      <section class="card logi-tabela-wrap"><h3>Devoluções pendentes</h3><table class="logi-tabela"><thead><tr><th>Entrega</th><th>Material</th><th>Em aberto</th><th>Técnico / obra</th><th>Ação</th></tr></thead><tbody>${devolucoes.map((d) => `<tr><td>${esc(dataLocal(d.criado_em))} · ficha ${esc(d.recibo_id)}</td><td>${esc(d.material)}</td><td>${esc(d.pendente)} ${esc(d.unidade)}</td><td>${esc(d.tecnico)} · ${esc(d.centro || '—')}</td><td><button type="button" class="btn btn-s" data-devolucao-recibo="${d.recibo_id}" data-devolucao-material="${d.material_id}" data-devolucao-nome="${esc(d.material)}" data-devolucao-restante="${d.pendente}">Registrar retorno</button></td></tr>`).join('') || '<tr><td colspan="5">Nenhuma devolução pendente.</td></tr>'}</tbody></table></section>
      <section class="card logi-tabela-wrap"><h3>Histórico recente de materiais</h3><table class="logi-tabela"><thead><tr><th>Data</th><th>Movimento</th><th>Material</th><th>Quantidade</th><th>Técnico / obra</th><th>Motivo</th></tr></thead><tbody>${movimentos.slice(0, 100).map((m) => `<tr><td>${esc(dataLocal(m.criado_em))}</td><td>${esc(m.tipo)}</td><td>${esc(m.material)}</td><td>${esc(m.quantidade)} ${esc(m.unidade)}</td><td>${esc(m.tecnico || '—')} · ${esc(m.centro || '—')}</td><td>${esc(m.motivo)}</td></tr>`).join('') || '<tr><td colspan="6">Sem movimentações.</td></tr>'}</tbody></table></section>`;
    const form = CC.$('[data-form]', el);
    CC.$$('[data-devolucao-recibo]', el).forEach((button) => button.addEventListener('click', async () => {
      dialogoFormulario({ titulo: `Devolver ${button.dataset.devolucaoNome}`, ok: 'Registrar retorno', corpo: `<label>Quantidade devolvida (máximo ${esc(button.dataset.devolucaoRestante)})<input class="inp" name="quantidade" type="number" min="0.001" max="${esc(button.dataset.devolucaoRestante)}" step="0.001" value="${esc(button.dataset.devolucaoRestante)}" required></label>`, aoEnviar: async (form) => {
        await CC.api('/logistica/materiais/devolucoes', { method: 'POST', body: { reciboId: Number(button.dataset.devolucaoRecibo), materialId: Number(button.dataset.devolucaoMaterial), quantidade: Number(form.elements.quantidade.value), client_id: CC.uuid() } }); CC.toast('Devolução registrada'); atualizar();
      } });
    }));
    CC.$('[data-novo]', el).addEventListener('click', () => { form.hidden = !form.hidden; });
    form.addEventListener('submit', async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.exigeRetorno = form.elements.exigeRetorno.checked;
      try { await CC.api('/logistica/materiais', { method: 'POST', body: data }); CC.toast('Material cadastrado'); atualizar(); } catch (error) { CC.toast(error.message || 'Falha ao cadastrar material'); } });
    const entrada = async (materialId = '') => {
      const select = materialId ? `<input type="hidden" name="materialId" value="${esc(materialId)}">` : `<label>Material<select class="inp" name="materialId" required>${lista.map((m) => `<option value="${esc(m.id)}">${esc(m.nome)} (${esc(m.unidade)})</option>`).join('')}</select></label>`;
      dialogoFormulario({ titulo: 'Registrar entrada de material', ok: 'Atualizar estoque', corpo: `${select}<label>Quantidade<input class="inp" name="quantidade" type="number" min="0.001" step="0.001" required></label><label>Motivo<input class="inp" name="motivo" value="Reposição" maxlength="200" required></label>`, aoEnviar: async (form) => {
        await CC.api('/logistica/materiais/entradas', { method: 'POST', body: { materialId: Number(form.elements.materialId.value), quantidade: Number(form.elements.quantidade.value), motivo: form.elements.motivo.value.trim(), client_id: CC.uuid() } }); CC.toast('Estoque atualizado'); atualizar();
      } });
    };
    CC.$('[data-entrada]', el).addEventListener('click', () => entrada());
    CC.$$('[data-repor]', el).forEach((button) => button.addEventListener('click', () => entrada(button.dataset.repor)));
  }

  function desenharSolicitacoes(el, pedidos, materiais, opcoes, atualizar) {
    const options = (rows, key, label) => rows.map((item) => `<option value="${item[key]}">${esc(item[label])}</option>`).join('');
    const lineOptions = options(materiais, 'id', 'nome');
    CC.$('[data-corpo]', el).innerHTML = `<section class="card logi-bloco"><div><h2>Pedidos e entregas diretas</h2><p>Confira o saldo e entregue ao técnico responsável pela obra ou serviço.</p></div><button type="button" class="btn btn-p" data-direta>Nova entrega direta</button></section>
      <form class="card logi-form" data-form hidden><h3>Entregar material</h3><label>Técnico<select name="tecnicoId" class="inp" required>${options(opcoes.tecnicos, 'id', 'nome')}</select></label><label>Obra ou serviço<select name="centroId" class="inp" required>${options(opcoes.centros, 'id', 'name')}</select></label><label>Material<select name="materialId" class="inp" required>${lineOptions}</select></label><label>Quantidade<input name="quantidade" class="inp" type="number" min="0.001" step="0.001" required></label><button class="btn btn-p">Registrar entrega e imprimir ficha</button></form>
      <section class="card logi-tabela-wrap"><table class="logi-tabela"><thead><tr><th>Pedido</th><th>Material</th><th>Quantidade</th><th>Obra/serviço</th><th>Solicitante</th><th>Ação</th></tr></thead><tbody>${pedidos.filter((p) => ['solicitada','parcial'].includes(p.status)).map((p) => `<tr><td>${esc(p.status)}</td><td>${esc(p.material)}</td><td>${esc(Number(p.solicitada) - Number(p.entregue))} ${esc(p.unidade)} restantes</td><td>${esc(p.centro)}</td><td>${esc(p.tecnico)}</td><td><button type="button" class="btn btn-s" data-atender="${p.id}" data-tecnico="${p.tecnico_id}" data-centro="${p.centro_id}" data-material="${p.material_id}" data-restante="${Number(p.solicitada) - Number(p.entregue)}">Entregar</button></td></tr>`).join('') || '<tr><td colspan="6">Nenhum pedido pendente.</td></tr>'}</tbody></table></section>`;
    const form = CC.$('[data-form]', el);
    CC.$('[data-direta]', el).addEventListener('click', () => { form.hidden = !form.hidden; });
    CC.$$('[data-atender]', el).forEach((button) => button.addEventListener('click', async () => {
      form.hidden = false; form.elements.tecnicoId.value = button.dataset.tecnico; form.elements.centroId.value = button.dataset.centro;
      form.elements.materialId.value = button.dataset.material; form.elements.quantidade.value = button.dataset.restante;
      form.dataset.solicitacaoId = button.dataset.atender; form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = new FormData(form);
      const body = { tecnicoId: Number(data.get('tecnicoId')), centroId: Number(data.get('centroId')),
        itens: [{ materialId: Number(data.get('materialId')), quantidade: Number(data.get('quantidade')) }], client_id: CC.uuid() };
      if (form.dataset.solicitacaoId) body.solicitacaoId = Number(form.dataset.solicitacaoId);
      try { const { data: issue } = await CC.api('/logistica/materiais/entregas', { method: 'POST', body });
        const { data: receipt } = await CC.api(`/logistica/entregas/${issue.id}`); reciboImpressao = receipt; imprimirRecibo(el, receipt); CC.toast('Material entregue e ficha criada'); atualizar(); }
      catch (error) { CC.toast(error.message || 'Não foi possível entregar material'); }
    });
  }

  function formularioFerramenta(el, atualizar) {
    const corpo = CC.$('[data-corpo]', el);
    corpo.innerHTML = `<section class="card logi-form"><h2>Cadastrar ferramenta</h2><form data-form><label>Nome<input class="inp" name="nome" maxlength="120" required></label><label>Código de patrimônio<input class="inp" name="codigo" maxlength="80" required></label><div class="logi-form-acoes"><button type="button" class="btn btn-s" data-voltar>Cancelar</button><button class="btn btn-p">Adicionar ao inventário</button></div></form></section>`;
    CC.$('[data-voltar]', el).addEventListener('click', atualizar);
    CC.$('[data-form]', el).addEventListener('submit', async (event) => {
      event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget));
      try { await CC.api('/logistica/ferramentas', { method: 'POST', body }); CC.toast('Ferramenta adicionada ao inventário'); aba = 'ferramentas'; atualizar(); }
      catch (error) { CC.toast(error.message || 'Não foi possível cadastrar a ferramenta'); }
    });
  }

  async function formularioEntrega(el, atualizar) {
    const corpo = CC.$('[data-corpo]', el);
    try {
      const [tecnicos, ferramentas] = await Promise.all([CC.api('/logistica/tecnicos'), CC.api('/logistica/ferramentas')]);
      const disponiveis = ferramentas.data.filter((item) => item.situacao === 'disponivel');
      corpo.innerHTML = `<section class="card logi-form"><h2>Entregar ferramentas ao técnico</h2><p>A saída do estoque acontece ao registrar a entrega física. O técnico receberá a ficha para assinar no celular.</p><form data-form><label>Técnico responsável<select class="inp" name="tecnicoId" required>${tecnicos.data.map((item) => `<option value="${item.id}">${esc(item.nome)}</option>`).join('')}</select></label><fieldset><legend>Ferramentas disponíveis</legend>${disponiveis.map((item) => `<label class="logi-escolha"><input type="checkbox" name="ferramentaIds" value="${item.id}"><span>${esc(item.nome)} · ${esc(item.codigo)}</span></label>`).join('') || '<p>Não há ferramentas disponíveis no momento.</p>'}</fieldset><div class="logi-form-acoes"><button type="button" class="btn btn-s" data-voltar>Cancelar</button><button class="btn btn-p" ${disponiveis.length ? '' : 'disabled'}>Registrar e imprimir ficha</button></div></form></section>`;
      CC.$('[data-voltar]', el).addEventListener('click', atualizar);
      CC.$('[data-form]', el).addEventListener('submit', async (event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const body = { tecnicoId: Number(form.get('tecnicoId')), ferramentaIds: form.getAll('ferramentaIds').map(Number), client_id: CC.uuid() };
        if (!body.ferramentaIds.length) return CC.toast('Selecione pelo menos uma ferramenta');
        try { const { data } = await CC.api('/logistica/entregas', { method: 'POST', body });
          reciboImpressao = { ...data, tecnico: tecnicos.data.find((item) => item.id === body.tecnicoId)?.nome || 'Técnico' };
          CC.toast('Entrega registrada e aguardando assinatura'); imprimirRecibo(el, reciboImpressao); atualizar();
        } catch (error) { CC.toast(error.message || 'Não foi possível registrar a entrega'); }
      });
    } catch (error) { corpo.innerHTML = U.faixa('err', 'warning-circle', error.message || 'Não foi possível iniciar a entrega.'); }
  }

  async function formularioConferencia(el, atualizar) {
    const corpo = CC.$('[data-corpo]', el);
    corpo.innerHTML = U.carregando('Carregando técnicos e ferramentas disponíveis…');
    try {
      const [tecnicos, ferramentas] = await Promise.all([CC.api('/logistica/tecnicos'), CC.api('/logistica/ferramentas')]);
      corpo.innerHTML = `<section class="card logi-form"><h2>Conferência inicial</h2><p>Registre a posse atual com a data de hoje e envie a ficha para assinatura do técnico.</p><form data-form><label>Técnico<select class="inp" name="tecnicoId" required>${tecnicos.data.map((item) => `<option value="${item.id}">${esc(item.nome)}</option>`).join('')}</select></label><fieldset><legend>Ferramentas confirmadas com o técnico</legend>${ferramentas.data.filter((item) => item.situacao === 'disponivel').map((item) => `<label class="logi-escolha"><input type="checkbox" name="ferramentaIds" value="${item.id}"><span>${esc(item.nome)} · ${esc(item.codigo)}</span></label>`).join('') || '<p>Nenhuma ferramenta disponível para conferir.</p>'}</fieldset><div class="logi-form-acoes"><button type="button" class="btn btn-s" data-voltar>Cancelar</button><button class="btn btn-p">Gerar ficha de conferência</button></div></form></section>`;
      CC.$('[data-voltar]', el).addEventListener('click', atualizar);
      CC.$('[data-form]', el).addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = { tecnicoId: Number(form.get('tecnicoId')), ferramentaIds: form.getAll('ferramentaIds').map(Number), client_id: CC.uuid() };
        try {
          const { data } = await CC.api('/logistica/conferencias-iniciais', { method: 'POST', body });
          reciboImpressao = { ...data, tecnico: tecnicos.data.find((item) => item.id === body.tecnicoId)?.nome || 'Técnico' };
          CC.toast('Ficha de conferência criada'); imprimirRecibo(el, reciboImpressao); atualizar();
        } catch (error) { CC.toast(error.message || 'Não foi possível criar a ficha'); }
      });
    } catch (error) { corpo.innerHTML = U.faixa('err', 'warning-circle', error.message || 'Não foi possível iniciar a conferência.'); }
  }

  function imprimirRecibo(el, recibo) {
    const alvo = CC.$('[data-print]', el);
    alvo.hidden = false;
    const toolRows = (recibo.ferramentas || []).map((item) => `<tr><td>${esc(item.nome)}</td><td>${esc(item.codigo)}</td></tr>`).join('');
    const materialRows = (recibo.materiais || []).map((item) => `<tr><td>${esc(item.nome)}</td><td>${esc(item.quantidade)} ${esc(item.unidade)}</td></tr>`).join('');
    const isMaterial = recibo.tipo === 'entrega_material';
    alvo.innerHTML = `<article class="logi-recibo"><h1>${isMaterial ? 'Ficha de entrega de materiais' : recibo.tipo === 'conferencia_inicial' ? 'Conferência inicial de ferramentas' : 'Ficha de entrega de ferramentas'}</h1><p><b>Técnico:</b> ${esc(recibo.tecnico)}</p>${recibo.centro ? `<p><b>Obra/serviço:</b> ${esc(recibo.centro)}</p>` : ''}<p><b>Entregue por:</b> ${esc(recibo.emissor || '—')}</p><p><b>Data e hora:</b> ${esc(dataLocal(recibo.criado_em))}</p><p><b>Ficha:</b> ${esc(recibo.status.replaceAll('_', ' '))}</p><table><thead><tr><th>${isMaterial ? 'Material' : 'Ferramenta'}</th><th>${isMaterial ? 'Quantidade' : 'Código de patrimônio'}</th></tr></thead><tbody>${toolRows}${materialRows}</tbody></table><p class="logi-assinatura">Assinatura digital do técnico: ______________________________</p><button type="button" class="btn btn-p" data-imprimir>Imprimir ficha</button></article>`;
    CC.$('[data-imprimir]', alvo).addEventListener('click', () => window.print());
  }

  D.tela('logistica', { render });
})(window.CC);
