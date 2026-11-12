// Captura o painel do assistente com o ditado ao vivo (estado "ouvindo" com texto parcial e o texto final),
// no desktop (/d/, 1280x720) e no celular (/m/, 375x812), nos temas claro e escuro.
// Sem microfone nem Firebase reais: o microfone e um tom gerado pelo navegador e o SDK do Firebase e trocado
// por um de mentira (Fetch do DevTools) cuja Live API devolve a transcricao palavra por palavra.
// Uso: node scripts/conferencia/ditado.js [pasta-de-saida]  (porta: CONFERENCIA_PORTA, padrão 3161; o Chrome usa a seguinte)
const fs = require('node:fs');
const path = require('node:path');
const cdp = require('./cdp');
const { iniciar } = require('./servidor');

const SAIDA = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'imp-cc2-capturas'));
const PORTA = Number(process.env.CONFERENCIA_PORTA || 3161);
const FRASE = 'preciso saber quanto já gastamos com material elétrico na obra Aurora neste mês e quais lançamentos ainda estão pendentes';

const APP_FALSO = 'export const getApps=()=>[{}];export const initializeApp=()=>({});';
const AI_FALSO = `export const getAI=()=>({});export class GoogleAIBackend{}
export const Schema=new Proxy({},{get:()=>()=>({})});export const ResponseModality={AUDIO:'AUDIO'};
export const getGenerativeModel=()=>({startChat:()=>({}),generateContent:async()=>({response:{text:()=>'texto por trechos'}})});
export const getLiveGenerativeModel=()=>({connect:async()=>{
  const fila=[];let acordar=null,fechada=false,n=0,timer=0;const palavras=${JSON.stringify(FRASE.split(' '))};
  const empurrar=(m)=>{fila.push(m);if(acordar){acordar();acordar=null;}};
  return{async sendAudioRealtime(){if(!timer)timer=setInterval(()=>{if(n<palavras.length)empurrar({type:'serverContent',inputTranscription:{text:(n?' ':'')+palavras[n++]}});},420);},
    async*receive(){while(!fechada){if(!fila.length)await new Promise((r)=>{acordar=r;});while(fila.length)yield fila.shift();}},
    async close(){fechada=true;clearInterval(timer);if(acordar)acordar();}};}});`;

const MIC_FALSO = `if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{const c=new AudioContext();const o=c.createOscillator();const g=c.createGain();g.gain.value=.3;
const d=c.createMediaStreamDestination();o.frequency.value=220;o.connect(g);g.connect(d);o.start();return d.stream;};`;

const sessao = (s, tema) => {
  const p = s.PESSOAS.admin;
  const u = { id: s.ids.admin, nome: p.nome, email: p.email, role: 'admin' };
  return `try{localStorage.setItem('cc_token',${JSON.stringify(s.tokens.admin)});localStorage.setItem('cc_usuario',${JSON.stringify(JSON.stringify(u))});localStorage.setItem('cc_instancia',${JSON.stringify(JSON.stringify(s.instancia))});localStorage.setItem('cc_d_tema','${tema}');localStorage.setItem('cc_m_tema','${tema}');localStorage.setItem('cc_d_menu','aberto');}catch(e){}`;
};

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const s = await iniciar({ porta: PORTA });
  const chrome = await cdp.abrirChrome({ porta: PORTA + 1, extra: ['--autoplay-policy=no-user-gesture-required'] });
  let status = 0;
  try {
    const aba = await cdp.novaAba(chrome.base);
    const erros = [];
    aba.aoEvento((m) => { if (m.method === 'Runtime.exceptionThrown') erros.push(m.params.exceptionDetails.text + ((m.params.exceptionDetails.exception || {}).description || '')); });
    await aba.enviar('Runtime.enable');
    await aba.enviar('Fetch.enable', { patterns: [{ urlPattern: '*gstatic.com/firebasejs/*', requestStage: 'Request' }] });
    aba.aoEvento((m) => {
      if (m.method !== 'Fetch.requestPaused') return;
      const corpo = /firebase-ai\.js/.test(m.params.request.url) ? AI_FALSO : APP_FALSO;
      aba.enviar('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'application/javascript' }, { name: 'access-control-allow-origin', value: '*' }],
        body: Buffer.from(corpo).toString('base64') }).catch(() => {});
    });
    await aba.aoAbrir(MIC_FALSO);
    for (const [app, largura, altura, pronto] of [['d', 1280, 720, "document.querySelector('#conteudo') && document.querySelector('#conteudo').children.length"], ['m', 375, 812, "document.querySelector('#view') && document.querySelector('#view').children.length"]]) {
      for (const tema of ['claro', 'escuro']) {
        await aba.tamanho(largura, altura);
        await aba.esquemaDeCor(tema);
        const { identifier } = await aba.enviar('Page.addScriptToEvaluateOnNewDocument', { source: sessao(s, tema) });
        await aba.ir('about:blank');
        await aba.ir(`${s.url}/${app}/`);
        await aba.esperar(pronto, 15000);
        await aba.avaliar('new Promise((r) => setTimeout(r, 900))');
        await aba.avaliar('CC.ia.open().then(() => true)');
        await aba.esperar("document.querySelector('#ia-mic')", 8000);
        await aba.avaliar("(() => { const q = document.querySelector('#ia-q'); q.value = 'Quero saber:'; q.dispatchEvent(new Event('input')); })()");
        await aba.avaliar("document.querySelector('#ia-mic').click()");
        const chegou = await aba.esperar("document.querySelector('#ia-q').value.includes('material')", 15000);
        const parcial = await aba.avaliar("({ valor: document.querySelector('#ia-q').value, fraco: document.querySelector('#ia-q').classList.contains('ia-parcial'), nota: document.querySelector('#ia-voz').textContent, rolagemH: document.documentElement.scrollWidth > innerWidth + 1 })");
        await aba.print(path.join(SAIDA, `${app}-${tema}-ouvindo.png`), { formato: 'png' });
        await aba.avaliar("document.querySelector('#ia-mic').click()");
        const final = await aba.esperar("!document.querySelector('#ia-q').classList.contains('ia-parcial') && document.querySelector('#ia-voz').hidden", 10000);
        await aba.print(path.join(SAIDA, `${app}-${tema}-final.png`), { formato: 'png' });
        const valorFinal = await aba.avaliar("document.querySelector('#ia-q').value");
        console.log(`${app} ${tema}: parcial ${chegou ? 'ok' : 'FALHOU'} (${JSON.stringify(parcial)}); final ${final ? 'ok' : 'FALHOU'}: ${valorFinal}`);
        if (!chegou || !final) status = 1;
        await aba.enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      }
    }
    if (erros.length) { console.log('Erros na pagina:', erros.slice(0, 5)); status = 1; }
    await cdp.fecharAba(chrome.base, aba);
  } finally {
    await chrome.encerrar();
    await s.fechar();
  }
  console.log(`Capturas em ${SAIDA}`);
  process.exit(status);
}
main().catch((e) => { console.error(e); process.exit(1); });
