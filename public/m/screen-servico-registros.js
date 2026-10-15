// Relato de campo com rascunho por conta/servico e fotos revisadas antes de enviar.
(function (CC) {
  const { esc, icon } = CC;

  CC.sv.pendencias = function (s) {
    const itens = (s.checklist || []).filter((i) => !i.feito), fotos = s.fotos || [], p = [];
    if (itens.length) p.push({ codigo: 'checklist_incompleto', mensagem: `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} do checklist por fazer.` });
    if (!fotos.some((f) => f.fase === 'antes')) p.push({ codigo: 'sem_foto_antes', mensagem: 'Sem foto de antes.' });
    if (!fotos.some((f) => f.fase === 'depois')) p.push({ codigo: 'sem_foto_depois', mensagem: 'Sem foto de depois.' });
    if (!s.aceite) p.push({ codigo: 'sem_aceite', mensagem: 'Sem aceite do cliente.' });
    return p;
  };

  CC.sv.relato = async function (s) {
    const owner = CC.owner(), key = `${owner}|relato-${s.id}`;
    const salvo = await CC.store.get('cache', key).catch(() => null);
    if (owner !== CC.owner()) return;
    const base = salvo ? salvo.anterior : (s.descricaoBase !== undefined ? s.descricaoBase : (s.descricao || ''));
    const atual = s.descricaoServidor !== undefined ? s.descricaoServidor : (s.descricao || '');
    const conflito = base !== atual && (salvo || s.relatoPendente);
    const sh = CC.sheet('sv-sheet', `${CC.sheetHead('pencil-simple', 'Observações da execução')}<p class="muted od-sub">${esc(s.codigo)} · ${esc(s.nome)}</p>
      <label class="field"><span>O que foi feito / observações</span><textarea id="sr-texto" class="tc-obs" maxlength="5000" placeholder="Descreva as atividades, testes e dificuldades encontrados.">${esc(salvo ? salvo.texto : s.descricao || '')}</textarea></label>
      <p class="muted" id="sr-status" role="status">${salvo ? 'Rascunho recuperado deste celular.' : 'O relato aparece no relatório entregue ao cliente.'}</p>
      ${conflito ? `<div class="sv-note"><span>O relato mudou desde seu rascunho. Texto atual:<p class="tc-relato">${esc(atual || 'Sem relato.')}</p>
        <label><input id="sr-conflito" type="checkbox"> Revisei e quero substituir pelo meu texto.</label></span></div>` : ''}
      <div id="sr-erro" role="alert"></div><button class="btn sv-full" type="button" id="sr-salvar">${icon('check', 18)}Salvar relato</button>`);
    const texto = CC.$('#sr-texto', sh.el), status = CC.$('#sr-status', sh.el), btn = CC.$('#sr-salvar', sh.el);
    let gravacao = Promise.resolve(), revisao = 0;
    texto.addEventListener('input', () => {
      const atual = ++revisao;
      status.textContent = 'Salvando rascunho…';
      const draft = { key, texto: texto.value, anterior: base, at: Date.now() };
      gravacao = CC.store.put('cache', draft).then(() => {
        if (atual === revisao) status.textContent = 'Rascunho salvo neste celular.';
      }, () => {
        if (atual === revisao) status.textContent = 'Não foi possível guardar o rascunho. Mantenha esta janela aberta.';
      });
    });
    btn.addEventListener('click', async () => {
      if (owner !== CC.owner()) return;
      const confirmar = CC.$('#sr-conflito', sh.el);
      if (confirmar && !confirmar.checked) return CC.toast('Confira o texto atual antes de substituir.', 'warning-circle');
      const descricao = texto.value;
      if (descricao.length > 5000) return;
      CC.busy(btn, 'Salvando…'); texto.disabled = true;
      try {
        await gravacao;
        const via = await CC.sv.salvarObservacao({ ...s, descricaoBase: conflito ? atual : base }, descricao);
        await CC.store.del('cache', key).catch(() => {});
        sh.close();
        CC.toast(via === 'fila' ? 'Relato salvo no celular · aguardando envio' : 'Relato salvo', via === 'fila' ? 'cloud-arrow-up' : undefined);
        CC.sv.reload(s.id, 'exec');
      } catch (error) {
        CC.$('#sr-erro', sh.el).innerHTML = CC.sheetErr(error);
        btn.disabled = false; btn.innerHTML = `${icon('check', 18)}Salvar relato`; texto.disabled = false;
      }
    });
  };

  CC.sv.prepararFoto = async function (s, file, fase) {
    const owner = CC.owner();
    let conteudoBase64;
    try { conteudoBase64 = await CC.shrink(file); } catch { return CC.toast('Não foi possível ler a foto.', 'warning-circle'); }
    if (owner !== CC.owner()) return;
    const sh = CC.sheet('sv-sheet', `${CC.sheetHead('camera', fase === 'antes' ? 'Foto · antes' : 'Foto · depois')}
      <img class="tc-preview" src="${esc(conteudoBase64)}" alt="Foto selecionada para o serviço">
      <label class="field"><span>Legenda · opcional</span><input id="sf-legenda" maxlength="200" placeholder="Ex.: teste da central após o reparo"></label>
      <div id="sf-erro" role="alert"></div><button class="btn sv-full" type="button" id="sf-enviar">${icon('cloud-arrow-up', 18)}Salvar foto</button>`);
    const clientId = CC.uuid(), btn = CC.$('#sf-enviar', sh.el);
    btn.addEventListener('click', async () => {
      if (owner !== CC.owner()) return;
      const body = { fase, nome: `${fase}-${clientId}.jpg`, tipo: 'image/jpeg', conteudoBase64, legenda: CC.$('#sf-legenda', sh.el).value.trim() };
      CC.busy(btn, 'Salvando…');
      try {
        const via = await CC.sv.enviar(s, { client_id: clientId, op: 'foto', rotulo: `Foto (${fase})`, body },
          () => CC.api(`/servicos/${s.id}/fotos`, { method: 'POST', body }));
        sh.close();
        CC.toast(via === 'fila' ? 'Foto salva no celular · aguardando envio' : 'Foto salva', via === 'fila' ? 'cloud-arrow-up' : undefined);
        CC.sv.reload(s.id, 'exec');
      } catch (error) {
        CC.$('#sf-erro', sh.el).innerHTML = CC.sheetErr(error);
        btn.disabled = false; btn.innerHTML = `${icon('cloud-arrow-up', 18)}Salvar foto`;
      }
    });
  };
})(window.CC = window.CC || {});
