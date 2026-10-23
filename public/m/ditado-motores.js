// Ditado ao vivo, parte 2: os dois motores de transcricao (sem dependencia do Centro de Custos).
//  - Live: Gemini Live API (Firebase AI Logic) com transcricao da entrada de audio; o texto chega enquanto se fala.
//  - Trechos: a cada ~2,5 s transcreve a parte ainda aberta da fala com o Gemini comum (generateContent) e fecha
//    o trecho nas pausas; funciona em qualquer WebView e e o plano B automatico do Live.
// Contrato dos dois: iniciar() -> Promise; alimentar() a cada bloco novo; finalizar() -> Promise<texto>; cancelar().
(function (root) {
  const D = root.DitadoAoVivo = root.DitadoAoVivo || {};
  const junta = (...p) => p.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  D.junta = junta;
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const comLimite = (promessa, ms, msg) => Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

  // Transcricao de um trecho de PCM com o Gemini comum, testando os modelos em ordem (cota/sobrecarga passam ao proximo).
  D.criarTranscritor = function ({ sdk, modelos, instrucao, recuperavel }) {
    return async function (pcm) {
      const dados = D.base64(D.wav(pcm));
      const { ai, backend } = await sdk();
      const pedido = [{ text: instrucao }, { inlineData: { mimeType: 'audio/wav', data: dados } }];
      let erro;
      for (const m of modelos) {
        try {
          const model = ai.getGenerativeModel(backend, { model: m.nome, generationConfig: { temperature: 0, maxOutputTokens: 1000, thinkingConfig: { thinkingLevel: 'MINIMAL' } } });
          return String((await model.generateContent(pedido)).response.text() || '').trim();
        } catch (e) { erro = e; if (!recuperavel(e)) break; }
      }
      throw erro;
    };
  };

  // Motor por trechos (universal).
  D.motorTrechos = function ({ captura, transcrever, onTexto, onAviso, intervaloMs }) {
    const T = D.TAXA;
    let conf = '', inicio = 0, timer = 0, voando = null, falhas = 0, parado = false;
    async function rodada(final) {
      const fim = captura.total(), len = fim - inicio;
      if (len < T * 0.6) return;
      const cortar = final || (captura.silencioMs() >= 700 && len >= T * 3) || len >= T * 25;
      const texto = await transcrever(captura.fatia(inicio, fim));
      if (parado && !final) return;
      onTexto(junta(conf, texto));
      if (cortar) { conf = junta(conf, texto); inicio = fim; }
    }
    async function tick() {
      if (voando || parado) return;
      voando = rodada(false).then(() => { falhas = 0; }).catch(() => {
        falhas += 1;
        if (falhas === 3 && onAviso) onAviso('Sem texto ao vivo agora. Ele aparece quando você parar.');
      }).finally(() => { voando = null; });
    }
    return {
      nome: 'trechos',
      async iniciar() { timer = setInterval(tick, intervaloMs || 2500); },
      alimentar() {},
      async finalizar() {
        parado = true; clearInterval(timer);
        if (voando) await voando;
        parado = false; await rodada(true); parado = true;
        return conf;
      },
      cancelar() { parado = true; clearInterval(timer); },
    };
  };

  // Motor Live. `cfg`: { sdk, modelo, instrucao }. Falha de conexao ou queda no meio chama onFalha (o orquestrador troca de motor).
  D.motorLive = function ({ captura, cfg, onTexto, onFalha }) {
    const LOTE = D.TAXA / 10; // 100 ms por envio
    let sessao = null, enviado = 0, texto = '', ultimoTexto = Date.now(), encerrado = false, pronto = false, drenando = false;

    function drenar(tudo) {
      if (!pronto || !sessao || drenando) return;
      drenando = true;
      try {
        while (captura.total() - enviado >= (tudo ? 1 : LOTE)) {
          const f = captura.fatia(enviado, Math.min(captura.total(), enviado + LOTE * 5));
          enviado += f.length;
          sessao.sendAudioRealtime({ mimeType: `audio/pcm;rate=${D.TAXA}`, data: D.base64(new Uint8Array(f.buffer)) }).catch(() => {});
        }
      } finally { drenando = false; }
    }
    async function ouvir() {
      try {
        for await (const m of sessao.receive()) {
          const t = m && m.type === 'serverContent' && m.inputTranscription && m.inputTranscription.text;
          if (t) { texto += t; ultimoTexto = Date.now(); onTexto(junta(texto)); }
        }
        if (!encerrado) onFalha(new Error('A conexão ao vivo foi encerrada.'));
      } catch (e) { if (!encerrado) onFalha(e); }
    }
    async function fechar() { encerrado = true; const s = sessao; sessao = null; if (s) await s.close().catch(() => {}); }

    return {
      nome: 'live',
      async iniciar() {
        const { ai, backend } = await cfg.sdk();
        if (typeof ai.getLiveGenerativeModel !== 'function') throw new Error('Esta versão do SDK não tem a Live API.');
        const modelo = ai.getLiveGenerativeModel(backend, {
          model: cfg.modelo,
          generationConfig: { responseModalities: [(ai.ResponseModality && ai.ResponseModality.AUDIO) || 'AUDIO'], inputAudioTranscription: {} },
          systemInstruction: cfg.instrucao,
        });
        sessao = await comLimite(modelo.connect(), 8000, 'Tempo esgotado ao conectar a transcrição ao vivo.');
        if (encerrado) return fechar();
        pronto = true; ouvir(); drenar(false);
      },
      alimentar() { drenar(false); },
      async finalizar() {
        if (sessao) {
          drenar(true);
          // Um segundo de silencio faz a deteccao de fim de fala fechar o ultimo trecho; depois espera o texto assentar.
          try { await sessao.sendAudioRealtime({ mimeType: `audio/pcm;rate=${D.TAXA}`, data: D.base64(new Uint8Array(D.TAXA * 2)) }); } catch (e) { /* sessao caiu */ }
          const ini = Date.now(); ultimoTexto = ini;
          while (sessao && Date.now() - ini < 4500 && (Date.now() - ultimoTexto < 1100 || (!texto && Date.now() - ini < 3000))) await espera(150);
        }
        await fechar();
        return junta(texto);
      },
      cancelar() { fechar(); },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
