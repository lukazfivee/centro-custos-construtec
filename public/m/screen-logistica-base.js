// Logistica do escritorio no celular (gestor, p5): pecas comuns das abas e das folhas.
// Mesmas rotas do desktop (public/d/telas/logistica*.js, routes/logistica.js e logisticaMateriais.js);
// as regras de negocio ficam no servidor, aqui so rotulos e a conferencia dos campos antes de enviar.
(function (CC) {
  const { esc, icon } = CC;
  const L = CC.logi = CC.logi || {};
  L.modulos = L.modulos || {};

  L.API = {
    resumo: '/logistica/resumo', ferramentas: '/logistica/ferramentas', kit: '/logistica/kits/padrao', movFerr: '/logistica/movimentacoes',
    materiais: '/logistica/materiais', pedidos: '/logistica/materiais/solicitacoes', opcoes: '/logistica/materiais/opcoes-entrega',
    movMat: '/logistica/materiais/movimentacoes', faltas: '/logistica/faltas', devolucoes: '/logistica/materiais/devolucoes-pendentes', fichas: '/logistica/recibos-pendentes',
  };
  // Aba, visao e filtros ficam guardados enquanto o site esta aberto: voltar a tela reabre onde estava.
  L.estado = { aba: 'resumo', sub: { ferramental: 'inventario', materiais: 'estoque', historico: 'ferramentas' }, busca: '', status: '', fichas: '', estoque: '' };

  const SITUACOES = { disponivel: ['Disponível', 'ok'], com_tecnico: ['Com técnico', ''], em_falta: ['Em falta', 'fin-err'], em_avaliacao: ['Em avaliação', 'warn'], baixada: ['Baixada', ''] };
  const MOVIMENTOS = {
    entrada_base: 'Entrada no inventário', entrega_ferramenta: 'Entrega ao técnico', conferencia_inicial: 'Conferência inicial',
    devolucao: 'Devolução', devolucao_avariada: 'Devolução com avaria', reparada: 'Reparada', baixada: 'Baixada',
    falta_reportada: 'Falta relatada', falta_apurada: 'Falta apurada', falta_reposta: 'Falta reposta', assinado: 'Ficha assinada',
    divergencia: 'Divergência na ficha', divergencia_revisada: 'Divergência revisada', entrada: 'Entrada', entrega: 'Entrega', ajuste: 'Ajuste',
  };
  const CAMPOS = { codigo: 'Código', condicao: 'Condição', observacao: 'Observação', localizacao: 'Local', relato: 'Relato', apuracao: 'Apuração', motivo: 'Motivo', revisao: 'Revisão' };
  const LOCAIS = { base: 'Base', escritorio_base: 'Escritório base', baixada: 'Baixada' };
  L.STATUS = [['', 'Todas'], ...Object.entries(SITUACOES).map(([valor, s]) => [valor, s[0]])];

  L.rotulo = (valor) => {
    const texto = String(valor == null ? '' : valor).replaceAll('_', ' ');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };
  L.data = (valor) => (valor ? new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  L.qtd = (valor) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  L.local = (valor) => LOCAIS[valor] || L.rotulo(valor);
  L.movimento = (tipo) => MOVIMENTOS[tipo] || L.rotulo(tipo);
  // Detalhe do evento em frase legivel (texto puro; quem usa escapa).
  L.detalhe = (detalhe) => {
    if (!detalhe || typeof detalhe !== 'object') return '';
    return Object.entries(detalhe).filter(([chave, valor]) => CAMPOS[chave] && valor !== '' && valor != null)
      .map(([chave, valor]) => `${CAMPOS[chave]}: ${chave === 'localizacao' ? L.local(valor).toLowerCase() : String(valor).replaceAll('_', ' ')}`).join(' · ');
  };
  L.restante = (pedido) => Number(pedido.solicitada) - Number(pedido.entregue);
  L.pedidosAbertos = (pedidos) => pedidos.filter((p) => ['solicitada', 'parcial'].includes(p.status));

  // ---- Pecas de lista
  L.tag = (texto, tom) => `<span class="tag ${tom || ''}">${esc(texto)}</span>`;
  L.situacao = (valor) => { const s = SITUACOES[valor]; return s ? L.tag(s[0], s[1]) : L.tag(L.rotulo(valor)); };
  L.vazio = (ic, texto) => `<div class="empty">${icon(ic, 28)}${esc(texto)}</div>`;
  L.secao = (titulo, n) => `<h2 class="label lgo-sec">${esc(titulo)}${n ? ` · ${esc(n)}` : ''}</h2>`;
  // Cartao de uma linha da lista: titulo, etiquetas, linhas de apoio (texto puro) e botoes ja montados.
  L.item = ({ titulo, tags, linhas, botoes }) => `<article class="card lgo-item"><b>${esc(titulo)}</b>${tags ? `<span class="lgo-tags">${tags}</span>` : ''}
    ${(linhas || []).filter(Boolean).map((t) => `<small>${esc(t)}</small>`).join('')}${botoes ? `<div class="lgo-bts">${botoes}</div>` : ''}</article>`;
  // Botao de linha: texto curto, nome acessivel diz de qual item se trata.
  L.botao = (acao, id, rotulo, contexto, extra) => `<button type="button" class="btn2" data-${acao}="${esc(id)}"${extra || ''} aria-label="${esc(`${rotulo}: ${contexto}`)}">${esc(rotulo)}</button>`;
  L.seg = (ctx, aba, opcoes, rotulo) => `<div class="seg" role="group" aria-label="${esc(rotulo)}">${opcoes.map(([valor, texto]) => `<button type="button" data-sub="${valor}" aria-pressed="${valor === ctx.estado.sub[aba]}">${esc(texto)}</button>`).join('')}</div>`;
  L.ligarSeg = (ctx, aba) => CC.$$('[data-sub]', ctx.corpo).forEach((b) => b.addEventListener('click', () => { if (b.dataset.sub !== ctx.estado.sub[aba]) ctx.ir(aba, b.dataset.sub); }));

  // ---- Campos das folhas (fonte de 16 px e 48 px de altura vem de .field em m.css)
  L.NUM = 'type="number" inputmode="decimal" min="0.001" step="0.001" autocomplete="off"';
  L.campo = (rot, name, attrs) => `<label class="field"><span>${esc(rot)}</span><input name="${name}" ${attrs || ''}></label>`;
  L.area = (rot, name, attrs) => `<label class="field"><span>${esc(rot)}</span><textarea name="${name}" rows="4" maxlength="2000" enterkeyhint="done" ${attrs || ''}></textarea></label>`;
  L.select = (rot, name, opcoes, valor) => `<label class="field"><span>${esc(rot)}</span><select name="${name}">${opcoes.map(([v, r]) => `<option value="${esc(v)}"${String(v) === String(valor == null ? '' : valor) ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>`;
  L.marca = (rot, name, extra) => `<label class="lgo-check"><input type="checkbox" name="${name}" ${extra || ''}><span>${esc(rot)}</span></label>`;
  L.opcoes = (linhas, chave, rotulo, vazio) => [['', vazio], ...linhas.map((i) => [i[chave], i[rotulo]])];

  // Erro de campo: a folha marca o campo, leva o foco ate ele e mostra "Campo: motivo".
  L.falha = (campo, mensagem) => Object.assign(new Error(mensagem), { campo });
  L.texto = (form, name, rotulo, minimo) => {
    const valor = form.elements[name].value.trim();
    if (!valor) throw L.falha(name, `${rotulo}: preencha este campo.`);
    if (valor.length < (minimo || 1)) throw L.falha(name, `${rotulo}: escreva pelo menos ${minimo} caracteres.`);
    return valor;
  };
  L.escolha = (form, name, rotulo) => {
    const valor = Number(form.elements[name].value);
    if (!(valor > 0)) throw L.falha(name, `${rotulo}: selecione uma opção da lista.`);
    return valor;
  };
  // zero: aceita zero (saldo inicial, estoque minimo). maximo: limite do que ainda pode ser devolvido.
  L.numero = (form, name, rotulo, { zero, maximo } = {}) => {
    const bruto = form.elements[name].value.trim();
    const valor = Number(bruto.replace(',', '.'));
    if (!bruto && zero) return 0;
    if (!bruto || !Number.isFinite(valor)) throw L.falha(name, `${rotulo}: informe um número.`);
    if (zero ? valor < 0 : valor <= 0) throw L.falha(name, `${rotulo}: informe um número ${zero ? 'igual ou maior que' : 'maior que'} zero.`);
    if (maximo != null && valor > Number(maximo)) throw L.falha(name, `${rotulo}: o máximo é ${L.qtd(maximo)}.`);
    return valor;
  };
  // client_id da entrega: o mesmo enquanto os dados nao mudam, para repetir o envio sem registrar duas vezes.
  L.idem = () => {
    let chave = '', id = '';
    return (body) => { const k = JSON.stringify(body); if (k !== chave) { chave = k; id = CC.uuid(); } return { ...body, client_id: id }; };
  };

  // Folha de formulario. aoEnviar(form) lanca o erro mostrado na propria folha; feito() roda depois de salvar.
  L.folha = ({ icone, titulo, corpo, ok, aoAbrir, aoEnviar, feito }) => {
    const sh = CC.sheet('lg-sheet', `${CC.sheetHead(icone, titulo)}<form class="lgo-form" novalidate>${corpo}<div data-erro></div>
      <button class="btn lgm-full" type="submit">${esc(ok)}</button></form>`);
    const form = CC.$('form', sh.el), erro = CC.$('[data-erro]', form), botao = CC.$('[type=submit]', form);
    if (aoAbrir) aoAbrir(form);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (botao.disabled) return;
      erro.innerHTML = '';
      CC.$$('.bad', form).forEach((f) => f.classList.remove('bad'));
      CC.busy(botao, 'Salvando…');
      try { await aoEnviar(form); } catch (error) {
        botao.disabled = false;
        botao.textContent = ok;
        erro.innerHTML = CC.sheetErr(error);
        const alvo = error && error.campo ? form.querySelector(`[name="${error.campo}"]`) : null;
        if (alvo) { const caixa = alvo.closest('.field'); if (caixa) caixa.classList.add('bad'); alvo.focus(); }
        erro.scrollIntoView({ block: 'nearest' });
        return;
      }
      sh.close();
      if (feito) feito();
    });
    return sh;
  };
  // Folha so de leitura (historico de uma ferramenta, ficha).
  L.folhaInfo = (icone, titulo, corpo) => CC.sheet('lg-sheet', `${CC.sheetHead(icone, titulo)}<div class="lgo-form">${corpo}</div>`);
  L.aviso = (error, padrao) => CC.toast(error && error.status === 0 ? 'Sem internet. Esta ação precisa da conexão.' : (error && error.message) || padrao, 'warning-circle');
})(window.CC = window.CC || {});
