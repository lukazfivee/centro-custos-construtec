// Chrome headless pelo DevTools Protocol, sem dependencia: abre o Chrome com perfil temporario proprio
// (nunca o perfil do usuario), fala com ele por WebSocket e devolve prints.
// Usa o WebSocket nativo do Node (>= 22).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CAMINHOS_CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function acharChrome() {
  const achado = CAMINHOS_CHROME.find((c) => fs.existsSync(c));
  if (!achado) throw new Error('Chrome nao encontrado. Defina CHROME_PATH com o caminho do chrome.exe.');
  return achado;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

class Aba {
  constructor(ws) {
    this.ws = ws;
    this.proximo = 1;
    this.pendentes = new Map();
    this.ouvintes = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pendentes.has(msg.id)) {
        const { resolve, reject } = this.pendentes.get(msg.id);
        this.pendentes.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`)); else resolve(msg.result);
      } else if (msg.method) {
        for (const f of this.ouvintes) f(msg);
      }
    });
  }

  enviar(metodo, params = {}) {
    const id = this.proximo++;
    return new Promise((resolve, reject) => {
      this.pendentes.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method: metodo, params }));
    });
  }

  aoEvento(f) { this.ouvintes.push(f); }

  // Avalia uma expressao na pagina (await funciona) e devolve o valor.
  async avaliar(expressao) {
    const r = await this.enviar('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`Erro na pagina: ${(d.exception && d.exception.description) || d.text}`);
    }
    return r.result.value;
  }

  // Espera a condicao (expressao JS) ficar verdadeira, ate o limite.
  async esperar(condicao, limiteMs = 8000, passoMs = 80) {
    const fim = Date.now() + limiteMs;
    while (Date.now() < fim) {
      try { if (await this.avaliar(`!!(${condicao})`)) return true; } catch { /* pagina ainda carregando */ }
      await espera(passoMs);
    }
    return false;
  }

  async tamanho(largura, altura) {
    await this.enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: false });
  }

  async esquemaDeCor(tema) {
    await this.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema === 'escuro' ? 'dark' : 'light' }] });
  }

  // Roda o script antes de qualquer script da pagina, em toda navegacao (usado para sessao e tema).
  async aoAbrir(fonte) { await this.enviar('Page.addScriptToEvaluateOnNewDocument', { source: fonte }); }

  async ir(url) {
    const carregou = new Promise((resolve) => {
      const f = (msg) => { if (msg.method === 'Page.loadEventFired') { this.ouvintes = this.ouvintes.filter((o) => o !== f); resolve(); } };
      this.ouvintes.push(f);
    });
    await this.enviar('Page.navigate', { url });
    await Promise.race([carregou, espera(15000)]);
  }

  async print(arquivo, { formato = 'jpeg', qualidade = 82 } = {}) {
    const r = await this.enviar('Page.captureScreenshot', { format: formato, quality: formato === 'jpeg' ? qualidade : undefined, fromSurface: true });
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, Buffer.from(r.data, 'base64'));
    return arquivo;
  }

  async clicar(seletor) {
    const ok = await this.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return false; e.click(); return true; })()`);
    if (!ok) throw new Error(`Nao achei para clicar: ${seletor}`);
  }

  // Clica no primeiro elemento do seletor cujo texto contem o trecho.
  async clicarTexto(seletor, trecho) {
    const ok = await this.avaliar(`(() => { const t = ${JSON.stringify(trecho.toLowerCase())}; const e = [...document.querySelectorAll(${JSON.stringify(seletor)})].find((x) => (x.textContent || '').toLowerCase().includes(t)); if (!e) return false; e.click(); return true; })()`);
    if (!ok) throw new Error(`Nao achei "${trecho}" em ${seletor}`);
  }

  // Digita num campo de forma que o app perceba (evento input).
  async digitar(seletor, valor) {
    const ok = await this.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return false; e.focus(); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : (e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype); Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(valor)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (!ok) throw new Error(`Nao achei para digitar: ${seletor}`);
  }

  async tecla(chave) {
    const mapa = { Escape: [27, 'Escape'], Enter: [13, 'Enter'], Tab: [9, 'Tab'] };
    const [codigo, nome] = mapa[chave] || [0, chave];
    for (const tipo of ['keyDown', 'keyUp']) {
      await this.enviar('Input.dispatchKeyEvent', { type: tipo, key: nome, code: nome, windowsVirtualKeyCode: codigo, nativeVirtualKeyCode: codigo });
    }
  }

  fechar() { try { this.ws.close(); } catch { /* ja fechada */ } }
}

async function abrirChrome({ porta, extra = [] }) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'conferencia-chrome-'));
  const args = [
    `--remote-debugging-port=${porta}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${perfil}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-background-networking', '--hide-scrollbars=false',
    '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-features=Translate,MediaRouter',
    '--window-size=1600,1000', ...extra, 'about:blank',
  ];
  const processo = spawn(acharChrome(), args, { stdio: 'ignore', windowsHide: true });
  const encerrar = async () => {
    try { processo.kill(); } catch { /* ja saiu */ }
    if (process.platform === 'win32') {
      // O Chrome abre filhos; derruba a arvore pelo perfil temporario, sem tocar no Chrome do usuario.
      try { require('node:child_process').execSync(`taskkill /PID ${processo.pid} /T /F`, { stdio: 'ignore' }); } catch { /* ja saiu */ }
    }
    await espera(400);
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o Windows pode segurar um instante */ }
  };
  const base = `http://127.0.0.1:${porta}`;
  const fim = Date.now() + 20000;
  while (Date.now() < fim) {
    try { const r = await fetch(`${base}/json/version`); if (r.ok) return { base, encerrar }; } catch { /* ainda subindo */ }
    await espera(200);
  }
  await encerrar();
  throw new Error('O Chrome nao respondeu no DevTools Protocol.');
}

// Abre uma aba nova (limpa) e devolve a conexao.
async function novaAba(base, url = 'about:blank') {
  const r = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const info = await r.json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  const aba = new Aba(ws);
  aba.id = info.id;
  await aba.enviar('Page.enable');
  await aba.enviar('Runtime.enable');
  return aba;
}

async function fecharAba(base, aba) {
  aba.fechar();
  try { await fetch(`${base}/json/close/${aba.id}`); } catch { /* o Chrome ja fechou */ }
}

module.exports = { abrirChrome, novaAba, fecharAba, espera, acharChrome };
