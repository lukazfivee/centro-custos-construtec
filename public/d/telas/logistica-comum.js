// Pecas comuns da Logistica: rotulos em portugues, tabela em cartao, dialogos e o registro das abas.
(function (CC) {
  const D = CC.d;
  const U = D.ui;
  const { esc } = CC;
  const L = D.logi = { modulos: {} };

  const SITUACOES = {
    disponivel: ['Disponível', 'ok', 'check-circle'],
    com_tecnico: ['Com técnico', 'info', 'user'],
    em_falta: ['Em falta', 'err', 'warning'],
    em_avaliacao: ['Em avaliação', 'warn', 'wrench'],
    baixada: ['Baixada', 'neutro', 'prohibit'],
  };
  const MOVIMENTOS = {
    entrada_base: 'Entrada no inventário', entrega_ferramenta: 'Entrega ao técnico', conferencia_inicial: 'Conferência inicial',
    devolucao: 'Devolução', devolucao_avariada: 'Devolução com avaria', reparada: 'Reparada', baixada: 'Baixada',
    falta_reportada: 'Falta relatada', falta_apurada: 'Falta apurada', falta_reposta: 'Falta reposta', assinado: 'Ficha assinada',
    divergencia: 'Divergência na ficha', divergencia_revisada: 'Divergência revisada', entrada: 'Entrada', entrega: 'Entrega', ajuste: 'Ajuste',
  };
  const CAMPOS = { codigo: 'Código', condicao: 'Condição', observacao: 'Observação', localizacao: 'Local', relato: 'Relato', apuracao: 'Apuração', motivo: 'Motivo', revisao: 'Revisão' };
  const LOCAIS = { base: 'Base', escritorio_base: 'Escritório base', baixada: 'Baixada' };

  L.rotulo = (valor) => {
    const texto = String(valor == null ? '' : valor).replaceAll('_', ' ');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };
  L.data = (valor) => (valor ? new Date(valor).toLocaleString('pt-BR') : '—');
  L.qtd = (valor) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  L.local = (valor) => LOCAIS[valor] || L.rotulo(valor);
  L.movimento = (tipo) => MOVIMENTOS[tipo] || L.rotulo(tipo);
  L.situacao = (valor) => {
    const s = SITUACOES[valor];
    return s ? U.chip(s[0], s[1], s[2]) : U.chip(L.rotulo(valor), 'neutro');
  };
  // Detalhe do evento em frase legivel (texto puro; quem usa escapa).
  L.detalhe = (detalhe) => {
    if (!detalhe || typeof detalhe !== 'object') return '—';
    const partes = Object.entries(detalhe).filter(([chave, valor]) => CAMPOS[chave] && valor !== '' && valor != null)
      .map(([chave, valor]) => `${CAMPOS[chave]}: ${chave === 'localizacao' ? L.local(valor).toLowerCase() : String(valor).replaceAll('_', ' ')}`);
    return partes.length ? partes.join(' · ') : '—';
  };

  // Botao de linha: o texto e curto, o nome acessivel diz de qual item se trata.
  L.botaoLinha = (acao, id, rotulo, contexto, extra) => `<button type="button" class="btn btn-s" data-${acao}="${esc(id)}"${extra || ''} aria-label="${esc(`${rotulo}: ${contexto}`)}">${esc(rotulo)}</button>`;
  // Cartao com a tabela da casa dentro; ultima = a ultima coluna e de acoes.
  L.cartao = (html, ultimaAcao, legenda) => `<section class="card logi-tabela${ultimaAcao ? ' ult-acao' : ''}"${legenda ? ` data-legenda="${esc(legenda)}"` : ''}>${html}</section>`;
  L.titulo = (texto, contagem) => `<h2 class="logi-titulo">${esc(texto)}${contagem ? ` <span class="chip warn">${esc(contagem)}</span>` : ''}</h2>`;
  // Abaixo de 760 px a CSS vira cada linha em cartao; precisa do rotulo da coluna em cada celula.
  // A legenda (data-legenda do cartao) vira o <caption> que o leitor de tela anuncia.
  L.rotular = (raiz) => raiz.querySelectorAll('table.tbl').forEach((tabela) => {
    const legenda = tabela.closest('[data-legenda]')?.dataset.legenda;
    if (legenda && !tabela.querySelector('caption')) tabela.insertAdjacentHTML('afterbegin', `<caption class="sr">${esc(legenda)}</caption>`);
    const rotulos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    tabela.classList.add('logi-cards');
    tabela.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (rotulos[i]) td.dataset.label = rotulos[i]; }));
  });

  // Alternador de visao dentro da aba (segmentado da casa). Devolve o HTML; ligarVisoes trata o clique e devolve o foco.
  L.visoes = (ctx, aba, opcoes, rotulo) => `<div class="logi-sub">${U.seg('sub', opcoes, ctx.estado.sub[aba], rotulo)}</div>`;
  L.ligarVisoes = (ctx, aba) => CC.$('.seg', ctx.corpo).addEventListener('click', async (event) => {
    const botao = event.target.closest('[data-seg]');
    if (!botao || botao.dataset.valor === ctx.estado.sub[aba]) return;
    await ctx.ir(aba, botao.dataset.valor);
    CC.$('.seg [aria-pressed="true"]', ctx.corpo)?.focus();
  });

  function abrirCamada(camada, fechar, teclas) {
    document.addEventListener('keydown', teclas, true);
    document.body.appendChild(camada);
    return fechar;
  }

  // Dialogo de formulario: aoEnviar(form) lanca o erro que aparece dentro do proprio dialogo.
  L.dialogoFormulario = ({ titulo, corpo, ok, aoEnviar, aoAbrir }) => new Promise((resolve) => {
    const anterior = document.activeElement;
    const camada = D.el(`<div class="dialogo-camada"><form class="card dialogo lista" role="dialog" aria-modal="true" aria-labelledby="logi-dlg-titulo">
      <b id="logi-dlg-titulo">${esc(titulo)}</b>${corpo}<span class="erro-dlg faixa err" role="alert" hidden></span>
      <div class="bts"><button type="button" class="btn btn-s" data-cancelar>Cancelar</button><button type="submit" class="btn btn-p">${esc(ok)}</button></div>
    </form></div>`);
    const fechar = (feito) => { document.removeEventListener('keydown', teclas, true); camada.remove(); anterior?.focus?.(); resolve(feito); };
    const teclas = (event) => { if (event.key === 'Escape') { event.preventDefault(); fechar(false); } else D.prenderFoco(camada, event); };
    const form = CC.$('form', camada), erro = CC.$('.erro-dlg', camada), botoes = CC.$$('button', form);
    CC.$('[data-cancelar]', form).addEventListener('click', () => fechar(false));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); erro.hidden = true; botoes.forEach((b) => { b.disabled = true; });
      try { await aoEnviar(form); fechar(true); }
      catch (err) { erro.textContent = err.message || 'Não foi possível registrar.'; erro.hidden = false; botoes.forEach((b) => { b.disabled = false; }); }
    });
    abrirCamada(camada, fechar, teclas);
    if (aoAbrir) aoAbrir(form);
    CC.$('input:not([type=hidden]),select,textarea', form)?.focus();
  });

  // Dialogo so de leitura, com um botao Fechar.
  // imprimir: acrescenta o botao Imprimir e deixa so este dialogo visivel na impressao.
  L.dialogoInfo = ({ titulo, corpo, imprimir }) => {
    const anterior = document.activeElement;
    const camada = D.el(`<div class="dialogo-camada${imprimir ? ' logi-imprimir' : ''}"><div class="card dialogo lista logi-info" role="dialog" aria-modal="true" aria-labelledby="logi-info-titulo">
      <b id="logi-info-titulo">${esc(titulo)}</b>${corpo}<div class="bts">${imprimir ? `<button type="button" class="btn btn-s" data-imprimir>${D.ic('printer')}Imprimir</button>` : ''}<button type="button" class="btn btn-s" data-fechar>Fechar</button></div></div></div>`);
    const fechar = () => { document.removeEventListener('keydown', teclas, true); camada.remove(); anterior?.focus?.(); };
    const teclas = (event) => { if (event.key === 'Escape') { event.preventDefault(); fechar(); } else D.prenderFoco(camada, event); };
    CC.$('[data-fechar]', camada).addEventListener('click', fechar);
    if (imprimir) CC.$('[data-imprimir]', camada).addEventListener('click', () => window.print());
    abrirCamada(camada, fechar, teclas);
    L.rotular(camada);
    CC.$('[data-fechar]', camada).focus();
  };
})(window.CC);
