// Ditado ao vivo, parte 3: orquestrador (sem dependencia do Centro de Custos).
// Para levar a outro app: copie ditado-captura.js, ditado-motores.js e ditado-ao-vivo.js e carregue-os nessa ordem.
//   const d = DitadoAoVivo.criar({ sdk, modeloLive, modelosTexto, recuperavel, offline, amigavel });
//     sdk: async () => ({ ai, backend }) — `ai` e o modulo firebase-ai.js e `backend` o getAI(...) do app;
//     modeloLive: nome do modelo da Live API; modelosTexto: [{ nome }] em ordem (plano B e transcricao final);
//     opcionais: recuperavel(erro) -> tenta o proximo modelo; offline() -> bool; amigavel(erro) -> texto;
//     limiteMs (120000), intervaloMs (2500, motor por trechos), motor: 'trechos' para pular o Live.
//   d.suportado()  // ha microfone e Web Audio neste navegador
//   d.iniciar({ onParcial(texto), onFinal(texto), onErro(mensagem), onEstado('ouvindo'|'finalizando'|'livre'), onAviso(msg) });
//   d.parar();     // fecha e entrega o texto final por onFinal
//   d.cancelar();  // descarta tudo sem chamar nada
// Tenta o motor Live (texto enquanto fala); se nao conectar ou cair, segue com o motor por trechos usando o mesmo audio.
// Nenhum audio e guardado: as amostras vivem na memoria ate o fim da sessao.
(function (root) {
  const D = root.DitadoAoVivo = root.DitadoAoVivo || {};
  const INSTRUCAO_TEXTO = 'Transcreva fielmente este áudio em português do Brasil. Responda somente com o texto falado, com pontuação normal, sem comentários e sem aspas. Se não houver fala, responda vazio.';
  const INSTRUCAO_LIVE = 'Você é um transcritor silencioso de ditado em português do Brasil. Nunca responda, nunca converse: a única saída útil é a transcrição da entrada de áudio.';

  D.criar = function (cfg) {
    const limiteMs = cfg.limiteMs || 120000;
    const nav = () => root.navigator;
    const transcrever = D.criarTranscritor({ sdk: cfg.sdk, modelos: cfg.modelosTexto, instrucao: INSTRUCAO_TEXTO, recuperavel: cfg.recuperavel || (() => false) });
    let s = null;

    const suportado = () => Boolean(nav() && nav().mediaDevices && nav().mediaDevices.getUserMedia && (root.AudioContext || root.webkitAudioContext));
    const offline = () => Boolean(cfg.offline && cfg.offline());
    function msgMic(e) {
      const n = e && e.name;
      if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Não encontrei um microfone neste aparelho.';
      if (n === 'NotReadableError') return 'O microfone está em uso por outro aplicativo. Feche-o e tente de novo.';
      return 'Sem acesso ao microfone. Permita o microfone nas configurações do navegador ou do app e tente de novo.';
    }
    const msgTranscricao = (e) => (offline() ? 'Sem internet. Tente ditar de novo quando a conexão voltar.' : `Não consegui transcrever. ${cfg.amigavel ? cfg.amigavel(e) : ''}`.trim());
    const estado = (x) => { if (s && s.cbs.onEstado) s.cbs.onEstado(x); };

    function criarMotor(sessao, nome) {
      const comum = { captura: sessao.captura, onTexto: (t) => { if (s === sessao && !sessao.cancelado && sessao.cbs.onParcial) sessao.cbs.onParcial(t); } };
      if (nome === 'live') return D.motorLive({ ...comum, cfg: { sdk: cfg.sdk, modelo: cfg.modeloLive, instrucao: INSTRUCAO_LIVE }, onFalha: (e) => trocar(sessao, e) });
      return D.motorTrechos({ ...comum, transcrever, onAviso: sessao.cbs.onAviso, intervaloMs: cfg.intervaloMs });
    }
    // Live indisponivel (nao conectou ou caiu): continua por trechos, com o audio ja captado.
    async function trocar(sessao, motivo) {
      if (s !== sessao || sessao.cancelado || sessao.motor.nome !== 'live' || sessao.trocando || sessao.parando) return;
      sessao.trocando = true; sessao.motivo = motivo;
      const antigo = sessao.motor;
      sessao.motor = criarMotor(sessao, 'trechos');
      antigo.cancelar();
      await sessao.motor.iniciar();
    }
    function limpar(sessao) {
      clearTimeout(sessao.timer);
      sessao.captura.descartar();
      if (s === sessao) s = null;
    }

    async function iniciar(cbs) {
      if (s) return;
      if (offline()) return cbs.onErro('O ditado precisa de internet.');
      const sessao = s = { cbs, cancelado: false, parando: false, captura: null, motor: null, timer: 0, trocando: false };
      try {
        sessao.captura = await D.abrirCaptura({ onBloco: () => { if (sessao.motor) sessao.motor.alimentar(); } });
      } catch (e) { if (s === sessao) s = null; return cbs.onErro(msgMic(e)); }
      if (sessao.cancelado) return limpar(sessao);
      sessao.motor = criarMotor(sessao, cfg.motor === 'trechos' ? 'trechos' : 'live');
      estado('ouvindo');
      sessao.timer = setTimeout(parar, limiteMs);
      sessao.motor.iniciar().catch((e) => { if (sessao.motor.nome === 'live') return trocar(sessao, e); });
    }

    async function parar() {
      const sessao = s;
      if (!sessao || sessao.parando || sessao.cancelado) return;
      if (!sessao.captura) return cancelar(); // tocou em parar antes de o microfone abrir
      sessao.parando = true; clearTimeout(sessao.timer);
      sessao.captura.parar();
      estado('finalizando');
      const cb = sessao.cbs, curto = sessao.captura.total() < D.TAXA / 2;
      try {
        if (curto) { cb.onFinal(''); return; }
        let texto = '';
        try { texto = await sessao.motor.finalizar(); } catch (e) { if (sessao.motor.nome !== 'live') throw e; sessao.motivo = e; }
        // Live sem texto (falhou ou nao entregou): uma transcricao unica do audio inteiro.
        if (!texto && !sessao.cancelado && sessao.motor.nome === 'live' && sessao.captura.temVoz()) {
          texto = await transcrever(sessao.captura.fatia(0, sessao.captura.total()));
        }
        if (sessao.cancelado) return;
        if (!texto) cb.onErro('Não entendi nada. Fale mais perto do microfone e tente de novo.'); else cb.onFinal(texto);
      } catch (e) {
        if (!sessao.cancelado) cb.onErro(msgTranscricao(e));
      } finally {
        limpar(sessao);
        if (cb.onEstado) cb.onEstado('livre');
      }
    }

    function cancelar() {
      const sessao = s;
      if (!sessao) return;
      sessao.cancelado = true;
      if (sessao.motor) sessao.motor.cancelar();
      if (sessao.captura) limpar(sessao); else s = null;
      if (sessao.cbs.onEstado) sessao.cbs.onEstado('livre');
    }

    return { suportado, iniciar, parar, cancelar, ativo: () => Boolean(s), motorAtual: () => (s && s.motor ? s.motor.nome : '') };
  };
})(typeof window !== 'undefined' ? window : globalThis);
