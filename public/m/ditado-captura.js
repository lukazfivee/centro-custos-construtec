// Ditado ao vivo, parte 1: captura do microfone em PCM 16 kHz mono (Int16), sem dependencia do Centro de Custos.
// Usa AudioWorklet e, onde ele nao existe ou e bloqueado, ScriptProcessor. Nada e gravado em disco: as amostras
// ficam so na memoria ate descartar(). Pode ser copiado como esta para outros apps (junto com os outros ditado-*.js).
(function (root) {
  const D = root.DitadoAoVivo = root.DitadoAoVivo || {};
  const TAXA = 16000;
  D.TAXA = TAXA;

  const WORKLET = 'class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true;}}registerProcessor("ditado-pcm",P);';

  // Reamostra em fluxo (media simples da janela) de taxaIn para 16 kHz.
  function reamostrador(taxaIn) {
    const r = taxaIn / TAXA;
    let buf = new Float32Array(0), pos = 0;
    return function (entrada) {
      const junto = new Float32Array(buf.length + entrada.length);
      junto.set(buf); junto.set(entrada, buf.length); buf = junto;
      const saida = [];
      for (;;) {
        const fim = pos + r;
        if (Math.ceil(fim) > buf.length) break;
        let soma = 0, n = 0;
        for (let j = Math.floor(pos); j < Math.ceil(fim); j += 1) { soma += buf[j]; n += 1; }
        saida.push(soma / n); pos = fim;
      }
      const corte = Math.floor(pos);
      buf = buf.slice(corte); pos -= corte;
      const out = new Int16Array(saida.length);
      for (let i = 0; i < saida.length; i += 1) { const v = Math.max(-1, Math.min(1, saida[i])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      return out;
    };
  }

  D.reamostrador = reamostrador;

  // Abre o microfone. Devolve { parar, descartar, total, fatia, silencioMs, temVoz }.
  // `amostras` sao Int16 a 16 kHz; fatia(i, f) devolve uma copia do trecho [i, f).
  D.abrirCaptura = async function ({ onBloco, limiarVoz = 0.012 } = {}) {
    const nav = root.navigator;
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const stream = await nav.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    let ctx;
    try { ctx = new Ctx(); if (ctx.state === 'suspended') await ctx.resume(); } catch (e) { stream.getTracks().forEach((t) => t.stop()); throw e; }
    const blocos = []; let total = 0, ultimaVoz = -1, vivo = true, temVoz = false;
    const reamostra = reamostrador(ctx.sampleRate);
    const origem = ctx.createMediaStreamSource(stream);
    const mudo = ctx.createGain(); mudo.gain.value = 0; mudo.connect(ctx.destination); // sem eco no alto-falante
    let no = null, urlWorklet = '';

    function receber(float) {
      if (!vivo) return;
      let soma = 0;
      for (let i = 0; i < float.length; i += 1) soma += float[i] * float[i];
      const bloco = reamostra(float);
      if (!bloco.length) return;
      if (Math.sqrt(soma / float.length) > limiarVoz) { ultimaVoz = total + bloco.length; temVoz = true; }
      blocos.push(bloco); total += bloco.length;
      if (onBloco) onBloco(bloco);
    }

    try {
      if (!ctx.audioWorklet || !root.Blob || !root.URL || !root.URL.createObjectURL) throw new Error('sem worklet');
      urlWorklet = root.URL.createObjectURL(new root.Blob([WORKLET], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(urlWorklet);
      no = new root.AudioWorkletNode(ctx, 'ditado-pcm');
      no.port.onmessage = (e) => receber(e.data);
    } catch (e) {
      no = ctx.createScriptProcessor(4096, 1, 1);
      no.onaudioprocess = (ev) => receber(new Float32Array(ev.inputBuffer.getChannelData(0)));
    }
    origem.connect(no); no.connect(mudo);

    const juntar = (i, f) => {
      const out = new Int16Array(Math.max(0, Math.min(f, total) - i));
      let off = 0;
      for (const b of blocos) {
        const ini = Math.max(i, off), fim = Math.min(f, off + b.length);
        if (fim > ini) out.set(b.subarray(ini - off, fim - off), ini - i);
        off += b.length; if (off >= f) break;
      }
      return out;
    };
    return {
      total: () => total,
      fatia: juntar,
      temVoz: () => temVoz,
      silencioMs: () => ((total - Math.max(ultimaVoz, 0)) / TAXA) * 1000,
      // Para de ouvir e solta o microfone (as amostras continuam ate descartar()).
      parar() {
        if (!vivo) return;
        vivo = false;
        try { no.disconnect(); origem.disconnect(); mudo.disconnect(); } catch (e) { /* ja solto */ }
        if (no.port) no.port.onmessage = null;
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        if (urlWorklet) root.URL.revokeObjectURL(urlWorklet);
      },
      descartar() { this.parar(); blocos.length = 0; total = 0; },
    };
  };

  // Utilitarios de formato: WAV mono 16 kHz e base64 (o Gemini aceita WAV em qualquer navegador).
  D.base64 = (bytes) => {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return root.btoa(s);
  };
  D.wav = (int16) => {
    const n = int16.length, out = new DataView(new ArrayBuffer(44 + n * 2));
    const txt = (o, t) => { for (let i = 0; i < t.length; i += 1) out.setUint8(o + i, t.charCodeAt(i)); };
    txt(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); txt(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, TAXA, true); out.setUint32(28, TAXA * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); txt(36, 'data'); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i += 1) out.setInt16(44 + i * 2, int16[i], true);
    return new Uint8Array(out.buffer);
  };
})(typeof window !== 'undefined' ? window : globalThis);
