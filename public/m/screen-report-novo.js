// Novo report direto pelo celular, sem depender do assistente (que continua no Menu):
// titulo, tipo, onde aconteceu, o que aconteceu, diagnostico simples do aparelho e um print opcional.
// Mesmo POST /api/bug-reports do desktop (public/d/telas/reports-form.js), com client_id contra duplicar.
(function (CC) {
  const { esc, icon } = CC;
  const A = CC.adm;
  const MAX_PRINT = 4 * 1024 * 1024;
  const TIPOS = [['bug', 'Erro'], ['sugestao', 'Sugestão'], ['duvida', 'Dúvida']];
  const OUTROS = ['Celular (app ou site)', 'Outro lugar'];

  const telas = () => [...new Set(Object.values(A.TELAS))].concat(OUTROS);
  const tamanho = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  // Foto do celular costuma passar de 4 MB: reduz para no maximo 1600 px em JPEG antes de enviar.
  function reduzir(arquivo) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * escala);
        canvas.height = Math.round(img.naturalHeight * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const dados = canvas.toDataURL('image/jpeg', 0.8).split(',')[1] || '';
        const bytes = Math.floor((dados.length * 3) / 4);
        if (!dados || bytes > MAX_PRINT) return reject(new Error('O print passa de 4 MB. Escolha uma imagem menor.'));
        return resolve({ nome: `${(arquivo.name || 'print').replace(/\.[^.]+$/, '')}.jpg`, tipo: 'image/jpeg', dados, tamanho: bytes });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
      img.src = url;
    });
  }

  CC.screens['report-novo'] = async function (params) {
    let print = null;
    const ultima = A.ultimaTela && telas().includes(A.ultimaTela) ? A.ultimaTela : 'Celular (app ou site)';
    const ia = CC.ia && CC.ia.ready && CC.ia.ready();
    const el = CC.render(`${A.top('Novo report', 'Vai para a equipe do sistema')}
      <label class="field"><span>Título</span><input id="rn-titulo" maxlength="200" autocomplete="off" placeholder="Ex.: Botão de anexar NF não responde"></label>
      <div><span class="label">Tipo</span><div class="seg" role="group" aria-label="Tipo">${TIPOS.map(([k, l]) => `<button type="button" data-tipo="${k}" aria-pressed="${k === 'bug'}">${l}</button>`).join('')}</div></div>
      <label class="field"><span>Onde aconteceu</span><select id="rn-tela">${telas().map((t) => `<option${t === ultima ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="field"><span>O que aconteceu</span><textarea id="rn-desc" rows="5" maxlength="10000" placeholder="Conte o que você fez, o que esperava e o que viu."></textarea></label>
      <label class="menu-item pref"><span>Incluir diagnóstico<small>Versão do app, navegador, conexão, tela e as últimas 20 ações. Nada de senhas ou valores.</small></span><input type="checkbox" id="rn-diag" checked></label>
      <div class="card"><div class="photo"><span class="thumb" id="rn-thumb">${icon('image', 22)}</span>
        <span class="grow"><b>Print (opcional)</b><small class="muted" id="rn-print-txt" style="display:block">Ajuda a equipe a ver o problema</small></span></div>
        <input type="file" id="rn-arquivo" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <span class="grid2" style="margin-top:10px"><button class="btn2" type="button" id="rn-escolher">${icon('image', 18)}Escolher</button><button class="btn2" type="button" id="rn-tirar" disabled>${icon('x', 18)}Remover</button></span></div>
      <p class="alert" role="alert" id="rn-erro"></p>
      ${ia ? `<button class="btn2" type="button" id="rn-ia">${icon('sparkle', 18)}Prefiro contar ao assistente</button>` : ''}
      <div class="actions"><button class="btn" type="button" id="rn-enviar">${icon('paper-plane-right', 18)}Enviar report</button></div>`, true, params);
    document.body.classList.add('no-tabs');
    A.voltar(el, 'reports');
    const erro = (t) => { CC.$('#rn-erro', el).textContent = t || ''; };
    CC.$$('[data-tipo]', el).forEach((b) => b.addEventListener('click', () => CC.$$('[data-tipo]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
    const mostrar = () => {
      CC.$('#rn-print-txt', el).textContent = print ? `${print.nome} · ${tamanho(print.tamanho)}` : 'Ajuda a equipe a ver o problema';
      CC.$('#rn-tirar', el).disabled = !print;
      const th = CC.$('#rn-thumb', el);
      th.style.backgroundImage = print ? `url(data:${print.tipo};base64,${print.dados})` : '';
      th.innerHTML = print ? '' : icon('image', 22);
    };
    CC.$('#rn-escolher', el).addEventListener('click', () => CC.$('#rn-arquivo', el).click());
    CC.$('#rn-tirar', el).addEventListener('click', () => { print = null; mostrar(); });
    CC.$('#rn-arquivo', el).addEventListener('change', async (event) => {
      const arquivo = event.target.files[0];
      event.target.value = '';
      if (!arquivo) return;
      if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) { erro('O print precisa ser uma imagem PNG, JPG, WEBP ou GIF.'); return; }
      try { print = await reduzir(arquivo); erro(''); } catch (error) { erro(error.message); }
      mostrar();
    });
    const iaBtn = CC.$('#rn-ia', el);
    if (iaBtn) iaBtn.addEventListener('click', () => CC.ia.open('Quero reportar um problema no app.'));
    const clientId = CC.uuid(); // o mesmo envio repetido nao duplica o report
    const enviar = CC.$('#rn-enviar', el);
    enviar.addEventListener('click', async () => {
      const titulo = CC.$('#rn-titulo', el).value.trim();
      const descricao = CC.$('#rn-desc', el).value.trim();
      if (titulo.length < 3) { erro('Dê um título de pelo menos 3 letras.'); return; }
      if (descricao.length < 5) { erro('Conte o que aconteceu, com pelo menos 5 letras.'); return; }
      erro('');
      const tipo = CC.$('[data-tipo][aria-pressed="true"]', el).dataset.tipo;
      const body = {
        titulo, descricao, tipo, tela: CC.$('#rn-tela', el).value, client_id: clientId,
        diagnostico: CC.$('#rn-diag', el).checked ? A.diag() : null,
        anexo: print ? { nome: print.nome, tipo: print.tipo, dados: print.dados } : null,
      };
      CC.busy(enviar, 'Enviando…');
      try {
        await CC.api('/bug-reports', { method: 'POST', body });
      } catch (error) {
        enviar.disabled = false;
        enviar.innerHTML = `${icon('paper-plane-right', 18)}Enviar report`;
        erro(A.erroTexto(error, 'Enviar o report'));
        return;
      }
      CC.toast('Report enviado · a equipe vai receber');
      CC.go('reports');
    });
  };
})(window.CC = window.CC || {});
