// Ditado ao vivo (public/m/ditado-*.js): captura, motores Live e por trechos, com mocks (sem microfone nem Firebase reais).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'm', f), 'utf8');
const pausa = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, ms = 3000) { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error('tempo esgotado no teste'); await pausa(); } }

// Ambiente de navegador falso: microfone com ScriptProcessor que o teste alimenta a mao.
function ambiente({ mic = 'ok' } = {}) {
  const estado = { trilhasParadas: 0, no: null };
  const nav = { mediaDevices: { getUserMedia: async () => {
    if (mic !== 'ok') { const e = new Error('x'); e.name = mic; throw e; }
    return { getTracks: () => [{ stop() { estado.trilhasParadas += 1; } }] };
  } } };
  class AudioContext {
    constructor() { this.sampleRate = 16000; this.state = 'running'; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    createScriptProcessor() { estado.no = { connect() {}, disconnect() {} }; return estado.no; }
    async close() {}
  }
  const ctx = { navigator: nav, AudioContext, setTimeout, clearTimeout, setInterval, clearInterval, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), Date };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['ditado-captura.js', 'ditado-motores.js', 'ditado-ao-vivo.js']) vm.runInContext(read(f), ctx, { filename: f });
  // Fala (tom) de `seg` segundos para o microfone falso.
  estado.falar = (seg, amp = 0.3) => {
    const n = Math.round(seg * 16000), f = new Float32Array(n);
    for (let i = 0; i < n; i += 1) f[i] = amp * Math.sin(i / 8);
    for (let i = 0; i < n; i += 4096) estado.no.onaudioprocess({ inputBuffer: { getChannelData: () => f.subarray(i, Math.min(n, i + 4096)) } });
  };
  return { D: ctx.DitadoAoVivo, ctx, estado };
}

// Gemini Live falso: devolve fragmentos de transcricao quando chega audio.
function aiLive({ conecta = true, fragmentos = [] } = {}) {
  const fila = [], enviados = [], visto = {};
  let acordar = null, fechada = false;
  const empurrar = (m) => { fila.push(m); if (acordar) { acordar(); acordar = null; } };
  const sessao = {
    async sendAudioRealtime(a) { enviados.push(a); while (fragmentos.length) empurrar({ type: 'serverContent', inputTranscription: { text: fragmentos.shift() } }); },
    async *receive() { while (!fechada) { if (!fila.length) await new Promise((r) => { acordar = r; }); while (fila.length) yield fila.shift(); } },
    async close() { fechada = true; if (acordar) acordar(); },
  };
  return { enviados, visto, ai: {
    ResponseModality: { AUDIO: 'AUDIO' },
    getLiveGenerativeModel: (b, cfg) => { visto.cfg = cfg; return { connect: async () => { if (!conecta) throw new Error('falha ao conectar'); return sessao; } }; },
    getGenerativeModel: () => ({ generateContent: async () => ({ response: { text: () => 'texto por trechos' } }) }),
  } };
}

const base = (D, ai, extra = {}) => D.criar({ sdk: async () => ({ ai, backend: {} }), modeloLive: 'live-x', modelosTexto: [{ nome: 'm1' }], recuperavel: () => false, offline: () => false, amigavel: () => 'Tente de novo.', ...extra });
const ouvintes = () => { const o = { parciais: [], finais: [], erros: [], estados: [] }; return { o, cbs: { onParcial: (t) => o.parciais.push(t), onFinal: (t) => o.finais.push(t), onErro: (m) => o.erros.push(m), onEstado: (e) => o.estados.push(e) } }; };

test('captura: reamostra 48 kHz para 16 kHz e gera WAV valido', () => {
  const { D } = ambiente();
  const saida = D.reamostrador(48000)(new Float32Array(4800).fill(0.5));
  assert.ok(Math.abs(saida.length - 1600) <= 1);
  assert.ok(saida.every((v) => Math.abs(v - 16383) < 3));
  const w = D.wav(new Int16Array([1, -2, 3]));
  assert.equal(Buffer.from(w.subarray(0, 4)).toString(), 'RIFF');
  assert.equal(w.length, 44 + 6);
  assert.equal(new DataView(w.buffer).getUint32(24, true), 16000);
});

test('Live: texto parcial aparece enquanto fala, final ao parar, microfone solto e audio descartado', async () => {
  const { D, estado } = ambiente();
  const { ai, enviados, visto } = aiLive({ fragmentos: ['olá', ' mundo'] });
  const d = base(D, ai), { o, cbs } = ouvintes();
  await d.iniciar(cbs);
  await ate(() => estado.no);
  estado.falar(0.5);
  await ate(() => o.parciais.includes('olá mundo'));
  assert.equal(d.motorAtual(), 'live');
  assert.equal(visto.cfg.model, 'live-x');
  assert.deepEqual(Array.from(visto.cfg.generationConfig.responseModalities), ['AUDIO']);
  assert.deepEqual(Object.keys(visto.cfg.generationConfig.inputAudioTranscription), []);
  assert.equal(enviados[0].mimeType, 'audio/pcm;rate=16000');
  await d.parar();
  assert.deepEqual(o.finais, ['olá mundo']);
  assert.equal(o.estados.at(-1), 'livre');
  assert.equal(estado.trilhasParadas, 1);
  assert.equal(d.ativo(), false);
});

test('Live que nao conecta cai para trechos e entrega o texto', async () => {
  const { D, estado } = ambiente();
  const d = base(D, aiLive({ conecta: false }).ai, { intervaloMs: 20 }), { o, cbs } = ouvintes();
  await d.iniciar(cbs);
  await ate(() => estado.no && d.motorAtual() === 'trechos');
  estado.falar(2);
  await ate(() => o.parciais.includes('texto por trechos'));
  await d.parar();
  assert.deepEqual(o.finais, ['texto por trechos']);
});

test('Live conectado mas sem texto: uma transcricao unica do audio inteiro ao parar', async () => {
  const { D, estado } = ambiente();
  const d = base(D, aiLive().ai), { o, cbs } = ouvintes();
  await d.iniciar(cbs);
  await ate(() => estado.no);
  estado.falar(1);
  await d.parar();
  assert.deepEqual(o.finais, ['texto por trechos']);
});

test('cancelar descarta tudo sem chamar onFinal nem onErro', async () => {
  const { D, estado } = ambiente();
  const d = base(D, aiLive({ fragmentos: ['rascunho'] }).ai), { o, cbs } = ouvintes();
  await d.iniciar(cbs);
  await ate(() => estado.no);
  estado.falar(0.5);
  d.cancelar();
  assert.equal(estado.trilhasParadas, 1);
  assert.deepEqual([o.finais, o.erros], [[], []]);
  assert.equal(d.ativo(), false);
});

test('limite de tempo encerra sozinho e entrega o texto', async () => {
  const { D, estado } = ambiente();
  const d = base(D, aiLive({ fragmentos: ['fim'] }).ai, { limiteMs: 60 }), { o, cbs } = ouvintes();
  await d.iniciar(cbs);
  await ate(() => estado.no);
  estado.falar(1);
  await ate(() => o.finais.length === 1, 8000);
  assert.deepEqual(o.finais, ['fim']);
});

test('erros claros em portugues: sem permissao, sem microfone, sem internet, sem fala', async () => {
  for (const [mic, texto] of [['NotAllowedError', /Sem acesso ao microfone/], ['NotFoundError', /Não encontrei um microfone/], ['NotReadableError', /em uso/]]) {
    const { D } = ambiente({ mic }), { o, cbs } = ouvintes();
    await base(D, aiLive().ai).iniciar(cbs);
    assert.match(o.erros[0], texto);
  }
  const off = ambiente(), vo = ouvintes();
  await base(off.D, aiLive().ai, { offline: () => true }).iniciar(vo.cbs);
  assert.equal(vo.o.erros[0], 'O ditado precisa de internet.');
  const m = ambiente(), v = ouvintes(), ai = aiLive().ai;
  ai.getGenerativeModel = () => ({ generateContent: async () => ({ response: { text: () => '' } }) });
  const d = base(m.D, ai, { motor: 'trechos' });
  await d.iniciar(v.cbs); await ate(() => m.estado.no);
  m.estado.falar(1); await d.parar();
  assert.match(v.o.erros[0], /Não entendi nada/);
});

test('falha de rede ao finalizar: mensagem com a orientacao do app e microfone solto', async () => {
  const m = ambiente(), v = ouvintes(), ai = aiLive().ai;
  ai.getGenerativeModel = () => ({ generateContent: async () => { throw new Error('rede'); } });
  const d = base(m.D, ai, { motor: 'trechos', intervaloMs: 1000 });
  await d.iniciar(v.cbs); await ate(() => m.estado.no);
  m.estado.falar(1); await d.parar();
  assert.match(v.o.erros[0], /Não consegui transcrever\. Tente de novo\./);
  assert.equal(m.estado.trilhasParadas, 1);
});

test('integracao: ia-voz preserva o texto digitado, mostra parcial fraco e o final no campo', async () => {
  const { ctx, estado } = ambiente();
  const { ai } = aiLive({ fragmentos: ['dois', ' mais dois'] });
  const q = { value: 'Texto antigo ', classList: { on: false, toggle(c, v) { this.on = v; }, remove() { this.on = false; } }, readOnly: false, focus() {}, dispatchEvent() {}, scrollTop: 0, scrollHeight: 0 };
  const mic = { classList: { toggle() {} }, setAttribute() {}, set innerHTML(v) {}, disabled: false };
  const nodes = { '#ia-q': q, '#ia-mic': mic, '#ia-voz': { hidden: true, textContent: '' } };
  ctx.Event = class {};
  ctx.CC = { icon: () => '', $: (s) => nodes[s], offline: () => false, iaConfig: { modeloLive: 'live-x', modelos: [{ nome: 'm1' }] } };
  vm.runInContext(read('ia-voz.js'), ctx);
  const log = [];
  const voz = ctx.CC.ia.criarVoz({ state: { busy: false, log }, sdk: async () => ({ ai, backend: {} }), context: async () => true, paint() {}, quota: () => false, busy: () => false, friendly: () => '' });
  assert.equal(voz.suportada(), true);
  await voz.toggle();
  await ate(() => estado.no);
  estado.falar(0.5);
  await ate(() => q.value === 'Texto antigo dois mais dois');
  assert.equal(q.classList.on, true);
  assert.equal(q.readOnly, true);
  assert.equal(voz.ocupado(), true);
  await voz.toggle();
  await ate(() => !voz.ocupado());
  assert.equal(q.value, 'Texto antigo dois mais dois');
  assert.equal(q.classList.on, false);
  assert.equal(q.readOnly, false);
  assert.deepEqual(log, []);
});

test('cada arquivo do ditado respeita o limite de 350 linhas e nao depende do Centro', () => {
  for (const f of ['ditado-captura.js', 'ditado-motores.js', 'ditado-ao-vivo.js']) {
    const src = read(f);
    assert.ok(src.split('\n').length <= 350, f);
    assert.doesNotMatch(src, /\bCC\b/, `${f} não pode citar o Centro`);
  }
});
