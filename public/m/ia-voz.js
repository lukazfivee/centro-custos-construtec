// Ditado do assistente (ia-chat.js): grava pelo microfone, converte para WAV e transcreve com o Gemini.
(function (CC) {
  const { icon } = CC;
  const IA = CC.ia = CC.ia || {};
  IA.criarVoz = function ({ state, sdk, context, paint, quota, busy, friendly }) {
    // Ditado: grava pelo microfone, converte para WAV mono 16 kHz (formato que o Gemini aceita em qualquer
    // navegador) e pede a transcricao ao mesmo Gemini do assistente. O texto cai no campo para a pessoa
    // conferir e enviar; nada de audio e guardado.
    const VOZ_MAX_MS = 120000;
    const voz = { rec: null, chunks: [], stream: null, timer: 0, state: 'idle', discard: false };
    const vozSuportada = () => Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));

    async function toWav(blob) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      let buffer;
      try { buffer = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close().catch(() => {}); }
      const rate = 16000, n = Math.max(1, Math.floor(buffer.duration * rate));
      const mono = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c += 1) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i += 1) mono[i] += d[i] / buffer.numberOfChannels; }
      const out = new DataView(new ArrayBuffer(44 + n * 2));
      const text = (o, t) => { for (let i = 0; i < t.length; i += 1) out.setUint8(o + i, t.charCodeAt(i)); };
      text(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); text(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
      out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); text(36, 'data'); out.setUint32(40, n * 2, true);
      const ratio = buffer.sampleRate / rate;
      for (let i = 0; i < n; i += 1) {
        const a = Math.min(mono.length - 1, Math.floor(i * ratio)), b = Math.min(mono.length - 1, a + 1), f = i * ratio - a;
        const v = Math.max(-1, Math.min(1, mono[a] * (1 - f) + mono[b] * f));
        out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      }
      return out.buffer;
    }
    const base64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

    async function transcrever(blob) {
      const data = base64(await toWav(blob));
      const { ai, backend } = await sdk();
      const pedido = [{ text: 'Transcreva fielmente este áudio em português do Brasil. Responda somente com o texto falado, com pontuação normal, sem comentários e sem aspas. Se não houver fala, responda vazio.' },
        { inlineData: { mimeType: 'audio/wav', data } }];
      let erro;
      for (const m of CC.iaConfig.modelos) {
        try {
          const model = ai.getGenerativeModel(backend, { model: m.nome, generationConfig: { temperature: 0, maxOutputTokens: 1000, thinkingConfig: { thinkingLevel: 'MINIMAL' } } });
          return String((await model.generateContent(pedido)).response.text() || '').trim();
        } catch (e) { erro = e; if (!quota(e) && !busy(e)) break; }
      }
      throw erro;
    }

    function vozPaint() {
      const b = CC.$('#ia-mic');
      if (!b) return;
      const gravando = voz.state === 'rec', trabalhando = voz.state === 'work';
      b.classList.toggle('rec', gravando);
      b.disabled = trabalhando || (state.busy && !gravando);
      b.setAttribute('aria-pressed', gravando ? 'true' : 'false');
      b.setAttribute('aria-label', gravando ? 'Parar e transcrever' : trabalhando ? 'Transcrevendo' : 'Ditar mensagem');
      b.innerHTML = trabalhando ? '<span class="ia-dots"><i></i><i></i><i></i></span>' : icon(gravando ? 'stop-fill' : 'microphone', 20);
      const note = CC.$('#ia-voz');
      if (note) { note.hidden = voz.state === 'idle'; note.textContent = gravando ? 'Ouvindo… toque no quadrado para parar.' : trabalhando ? 'Transcrevendo…' : ''; }
    }
    function vozLimpar() {
      if (voz.timer) { clearTimeout(voz.timer); voz.timer = 0; }
      if (voz.stream) voz.stream.getTracks().forEach((t) => t.stop());
      voz.stream = null; voz.rec = null; voz.chunks = [];
    }
    function vozErro(texto) { state.log.push({ who: 'erro', text: texto }); paint(); }

    async function vozIniciar() {
      if (CC.offline()) return vozErro('O ditado precisa de internet.');
      if (!await context()) return;
      try {
        voz.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (error) {
        return vozErro(error && error.name === 'NotFoundError' ? 'Não encontrei um microfone neste aparelho.' : 'Sem acesso ao microfone. Permita o microfone nas configurações do navegador ou do app e tente de novo.');
      }
      voz.chunks = []; voz.discard = false;
      const rec = voz.rec = new MediaRecorder(voz.stream);
      rec.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) voz.chunks.push(e.data); });
      rec.addEventListener('stop', async () => {
        const blob = new Blob(voz.chunks, { type: rec.mimeType || 'audio/webm' }), descartar = voz.discard;
        vozLimpar();
        if (descartar || blob.size < 1500) { voz.state = 'idle'; return vozPaint(); }
        voz.state = 'work'; vozPaint();
        try {
          const texto = await transcrever(blob);
          const q = CC.$('#ia-q');
          if (!texto) vozErro('Não entendi nada. Fale mais perto do microfone e tente de novo.');
          else if (q) { q.value = `${q.value.trim()}${q.value.trim() ? ' ' : ''}${texto}`.slice(0, 1500); q.dispatchEvent(new Event('input')); q.focus(); }
        } catch (error) { vozErro(`Não consegui transcrever. ${friendly(error)}`); }
        voz.state = 'idle'; vozPaint();
      });
      rec.start();
      voz.state = 'rec'; vozPaint();
      voz.timer = setTimeout(vozParar, VOZ_MAX_MS);
    }
    function vozParar() { if (voz.rec && voz.rec.state !== 'inactive') voz.rec.stop(); }
    // Fechar a folha com o microfone aberto descarta a gravacao.
    function vozCancelar() { if (voz.rec && voz.rec.state !== 'inactive') { voz.discard = true; voz.rec.stop(); } else if (voz.stream) vozLimpar(); }
    const toggle = () => (voz.state === 'rec' ? vozParar() : voz.state === 'idle' ? vozIniciar() : undefined);
    return { suportada: vozSuportada, toggle, cancelar: vozCancelar, ocupado: () => voz.state !== 'idle' };
  };
})(window.CC = window.CC || {});
