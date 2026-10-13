#!/usr/bin/env node
// Kit de conferencia do Desktop novo (/d/): abre cada tela em 1440x900 e 1280x800, nos temas claro e escuro,
// e salva os prints ao lado da Referencia (o prototipo, renderizado no mesmo tamanho e tema).
//
//   npm run conferir                      todas as telas
//   npm run conferir -- D6 D7             so os grupos D6 e D7
//   npm run conferir -- D6/usuarios-lista  so uma tela (grupo/id aparece em --listar; o id sozinho vale se for unico)
//   npm run conferir -- --listar          lista os grupos e as telas
//
// Opcoes: --tamanhos 1440x900,1280x800  --temas claro,escuro  --saida <pasta>  --sem-referencia
//         --validacao (grava tambem os prints do app em docs/suite-desktop/validacao/<grupo>/)
//         --porta 3101 (servidor; o Chrome usa porta+1 e o prototipo porta+2)
// Dados: banco temporario novo a cada execucao, com dados de exemplo inventados (servidor.js).
// Nada toca AppData, o banco do app instalado, o Neon ou o Cloudflare.
const fs = require('node:fs');
const path = require('node:path');

const { catalogo, GRUPOS } = require('./telas');
const cdp = require('./cdp');

const RAIZ = path.join(__dirname, '..', '..');
const VALIDACAO = path.join(RAIZ, 'docs', 'suite-desktop', 'validacao');

function lerArgumentos(argv) {
  const o = { alvos: [], tamanhos: ['1440x900', '1280x800'], temas: ['claro', 'escuro'], saida: path.join(VALIDACAO, '_conferencia'), referencia: true, validacao: false, listar: false, porta: Number(process.env.CONFERENCIA_PORTA || 3101) };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--listar') o.listar = true;
    else if (a === '--sem-referencia') o.referencia = false;
    else if (a === '--validacao') o.validacao = true;
    else if (a === '--tamanhos') o.tamanhos = argv[++i].split(',');
    else if (a === '--temas') o.temas = argv[++i].split(',');
    else if (a === '--saida') o.saida = path.resolve(argv[++i]);
    else if (a === '--porta') o.porta = Number(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`Opcao desconhecida: ${a}`);
    else o.alvos.push(a);
  }
  return o;
}

function escolher(alvos) {
  if (!alvos.length) return catalogo;
  const achadas = [];
  for (const alvo of alvos) {
    const grupo = catalogo.filter((t) => t.grupo.toLowerCase() === alvo.toLowerCase());
    const um = catalogo.filter((t) => t.id === alvo || `${t.grupo}/${t.id}` === alvo);
    const lote = grupo.length ? grupo : um;
    if (!lote.length) throw new Error(`Nada encontrado para "${alvo}". Use --listar.`);
    for (const t of lote) if (!achadas.includes(t)) achadas.push(t);
  }
  return achadas;
}

// Telas que gravam dados vao depois das que so leem, e desfazem o que fizeram (limpar) para a captura seguinte.
const ordenadas = (lista) => [...lista.filter((t) => !t.muda), ...lista.filter((t) => t.muda)];

function sessaoDe(s, quem, tema) {
  if (!quem) return `try{localStorage.setItem('cc_d_tema','${tema}');}catch(e){}`;
  const p = s.PESSOAS[quem];
  const usuario = { id: s.ids[quem], nome: p.nome, email: p.email, role: p.suiteRole === 'admin' ? 'admin' : (p.suiteRole === 'gestor' ? 'gestor' : 'supervisor') };
  return `try{localStorage.setItem('cc_token',${JSON.stringify(s.tokens[quem])});localStorage.setItem('cc_usuario',${JSON.stringify(JSON.stringify(usuario))});localStorage.setItem('cc_instancia',${JSON.stringify(JSON.stringify(s.instancia))});localStorage.setItem('cc_d_tema','${tema}');localStorage.setItem('cc_d_menu','aberto');}catch(e){}`;
}

// O que a pagina acusa sozinha: erro no console, rolagem horizontal e rolagem dentro de rolagem.
const SONDA = `(() => {
  const de = document.documentElement;
  const cont = document.querySelector('#conteudo');
  const nome = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const aninhada = [...document.querySelectorAll('*')].filter((e) => {
    if (e === document.body || e === de || e === cont || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA') return false;
    if (e.closest('.drawer, .dialogo-camada, .tabela-rolagem, .tab-rolagem')) return false;
    const cs = getComputedStyle(e);
    if (!/(auto|scroll)/.test(cs.overflowY)) return false;
    return e.clientHeight > 0 && e.scrollHeight > e.clientHeight + 2 && e.offsetParent !== null;
  }).map(nome).slice(0, 4);
  const horizontal = [...document.querySelectorAll('#conteudo *')].filter((e) => {
    if (e.closest('.tabela-rolagem, .tab-rolagem, .drawer, .dialogo-camada')) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed';
  }).map(nome).slice(0, 4);
  return { rolagemHorizontal: de.scrollWidth > innerWidth + 1, rolagemAninhada: aninhada, foraDaJanela: horizontal };
})()`;

async function capturar({ aba, s, tela, tam, tema, saidaApp, saidaRef, refUrl, referencia, erros }) {
  const [largura, altura] = tam.split('x').map(Number);
  const nomeArquivo = `${tam}-${tema}-${tela.id}.jpg`;
  const arq = (pasta) => path.join(pasta, tela.grupo, nomeArquivo);
  await aba.tamanho(largura, altura);
  await aba.esquemaDeCor(tema);
  await aba.enviar('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const registro = { id: tela.id, grupo: tela.grupo, tamanho: tam, tema, app: null, ref: null, avisos: [], erros: [] };
  erros.length = 0;

  const { identifier } = await aba.enviar('Page.addScriptToEvaluateOnNewDocument', { source: sessaoDe(s, tela.como === undefined ? 'admin' : tela.como, tema) });
  const ctx = montarContexto(aba, s, tam, tema);
  try {
    await aba.ir('about:blank');
    const rota = tela.rotaDe ? tela.rotaDe(s) : tela.rota;
    ctx.rota = rota;
    await aba.ir(`${s.url}/d/${rota ? `#/${rota}` : ''}`);
    await aba.esperar(tela.como === null ? "document.querySelector('#app') && document.querySelector('#app').innerText.length > 40" : "document.querySelector('#conteudo') && document.querySelector('#conteudo').children.length", 12000);
    await ctx.dormir(900);
    if (tela.preparar) await tela.preparar(ctx);
    await aba.avaliar('document.fonts.ready.then(() => true)');
    await ctx.dormir(tela.espera || 500);
    Object.assign(registro, { sonda: await aba.avaliar(SONDA) });
    await aba.print(arq(saidaApp));
    registro.app = `${tela.grupo}/${nomeArquivo}`;
  } catch (erro) {
    registro.erros.push(`Falha ao preparar a tela: ${erro.message}`);
    try { await aba.print(arq(saidaApp)); registro.app = `${tela.grupo}/${nomeArquivo}`; } catch { /* sem print */ }
  } finally {
    await aba.enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    if (tela.limpar) { try { await tela.limpar(ctx); } catch (e) { registro.erros.push(`Falha ao limpar: ${e.message}`); } }
  }
  registro.erros.push(...erros.map((e) => `console: ${e}`));

  if (referencia && tela.ref) {
    try {
      await aba.ir('about:blank');
      await aba.ir(`${refUrl}/_estado.html?start=${tela.ref}&tema=${tema}`);
      await aba.esperar("document.body && document.body.innerText.length > 40", 10000);
      await ctx.dormir(1600);
      await aba.print(arq(saidaRef));
      registro.ref = `${tela.grupo}/${nomeArquivo}`;
    } catch (erro) { registro.avisos.push(`Referencia nao capturada: ${erro.message}`); }
  } else if (referencia) {
    registro.avisos.push('Sem Referencia no prototipo para este estado.');
  }
  return registro;
}

function montarContexto(aba, s, tam, tema) {
  const ctx = {
    aba, s, tam, tema,
    dormir: cdp.espera,
    clicar: (sel) => aba.clicar(sel),
    clicarTexto: (sel, texto) => aba.clicarTexto(sel, texto),
    digitar: (sel, valor) => aba.digitar(sel, valor),
    esperar: (cond, ms) => aba.esperar(cond, ms),
    avaliar: (js) => aba.avaliar(js),
    tecla: (k) => aba.tecla(k),
    async recarregar() {
      await aba.ir('about:blank');
      await aba.ir(`${s.url}/d/${ctx.rota ? `#/${ctx.rota}` : ''}`);
      await aba.esperar("document.querySelector('#conteudo') && document.querySelector('#conteudo').children.length", 12000);
      await cdp.espera(900);
    },
    // Clica numa acao ([data-acao]) da linha da tabela que contem o texto.
    async linha(texto, acao) {
      const ok = await aba.avaliar(`(() => { const t = ${JSON.stringify(texto.toLowerCase())}; const tr = [...document.querySelectorAll('tr.rw, tr')].find((x) => (x.textContent || '').toLowerCase().includes(t) && x.querySelector('[data-acao]')); const b = tr && tr.querySelector('[data-acao="${acao}"]'); if (!b) return false; b.click(); return true; })()`);
      if (!ok) throw new Error(`Nao achei a acao "${acao}" na linha "${texto}"`);
      await cdp.espera(350);
    },
    async ir(rota) { await aba.avaliar(`location.hash = '#/${rota}'`); await cdp.espera(900); },
    // Espera aparecer e clica.
    async tocar(sel, ms = 6000) {
      if (!(await aba.esperar(`document.querySelector(${JSON.stringify(sel)})`, ms))) throw new Error(`Nao apareceu: ${sel}`);
      await aba.clicar(sel);
      await cdp.espera(350);
    },
    async tocarTexto(sel, texto, ms = 6000) {
      const cond = `[...document.querySelectorAll(${JSON.stringify(sel)})].some((x) => (x.textContent || '').toLowerCase().includes(${JSON.stringify(texto.toLowerCase())}))`;
      if (!(await aba.esperar(cond, ms))) throw new Error(`Nao apareceu "${texto}" em ${sel}`);
      await aba.clicarTexto(sel, texto);
      await cdp.espera(350);
    },
    async painel(ms = 6000) { // espera o painel lateral abrir e carregar
      if (!(await aba.esperar("document.querySelector('.drawer .dcorpo') && document.querySelector('.drawer .dcorpo').children.length", ms))) throw new Error('O painel nao abriu');
      await cdp.espera(700);
    },
    async dialogo(ms = 6000) {
      if (!(await aba.esperar("document.querySelector('.dialogo-camada')", ms))) throw new Error('O dialogo nao abriu');
      await cdp.espera(400);
    },
    async rolar(sel, para = 'fim') {
      await aba.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollTop = ${para === 'fim' ? 'e.scrollHeight' : Number(para)}; })()`);
      await cdp.espera(400);
    },
    async offline(sim = true) {
      await aba.enviar('Network.emulateNetworkConditions', { offline: sim, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await cdp.espera(500);
    },
    // Chama a API do servidor de teste com a sessao de uma pessoa (para preparar ou desfazer dados).
    api: (rota, metodo, corpo, quem = 'admin', esperado) => s.chamar(rota, metodo, corpo, quem, esperado),
  };
  return ctx;
}

function galeria(registros, opcoes) {
  const porTela = new Map();
  for (const r of registros) { const chave = `${r.grupo}/${r.id}`; if (!porTela.has(chave)) porTela.set(chave, []); porTela.get(chave).push(r); }
  const cel = (r) => `<figure><figcaption>${r.tamanho} · ${r.tema}</figcaption>
    <div class="par"><div><b>App</b>${r.app ? `<img loading="lazy" src="app/${r.app}">` : '<i>sem print</i>'}</div>
    <div><b>Referência</b>${r.ref ? `<img loading="lazy" src="ref/${r.ref}">` : '<i>sem referência</i>'}</div></div>
    ${[...r.erros, ...r.avisos, ...(r.sonda && r.sonda.rolagemHorizontal ? ['rolagem horizontal na página'] : []), ...(r.sonda && r.sonda.rolagemAninhada.length ? [`rolagem aninhada: ${r.sonda.rolagemAninhada.join(', ')}`] : [])].map((a) => `<p class="aviso">${a.replace(/</g, '&lt;')}</p>`).join('')}</figure>`;
  const blocos = [...porTela.entries()].map(([id, lista]) => `<section id="${id}"><h2>${id}</h2>${lista.map(cel).join('')}</section>`).join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conferência do Desktop novo</title>
<style>body{font:14px system-ui;margin:20px;background:#f3f6f7;color:#10303b}h2{margin:28px 0 8px}figure{margin:0 0 18px}figcaption{font-weight:600;margin:6px 0}
.par{display:grid;grid-template-columns:1fr 1fr;gap:10px}.par img{width:100%;border:1px solid #c5d3d8;display:block}.aviso{color:#9a3412;margin:4px 0}i{color:#6b8791}
nav a{margin-right:10px}</style><h1>Conferência do Desktop novo</h1><p>Gerado em ${new Date().toLocaleString('pt-BR')} · ${opcoes.tamanhos.join(', ')} · ${opcoes.temas.join(', ')}</p>
<nav>${[...porTela.keys()].map((id) => `<a href="#${id}">${id}</a>`).join('')}</nav>${blocos}</html>`;
}

async function principal() {
  const o = lerArgumentos(process.argv.slice(2));
  if (o.listar) {
    for (const g of GRUPOS) {
      console.log(`${g}`);
      for (const t of catalogo.filter((x) => x.grupo === g)) console.log(`  ${t.grupo}/${t.id}${t.ref ? `  (referência: ${t.ref})` : '  (sem referência)'}${t.muda ? '  [grava dados]' : ''}`);
    }
    return;
  }
  const telas = ordenadas(escolher(o.alvos));
  const saidaApp = path.join(o.saida, 'app');
  const saidaRef = path.join(o.saida, 'ref');
  fs.mkdirSync(saidaApp, { recursive: true });
  fs.mkdirSync(saidaRef, { recursive: true });

  const { iniciar } = require('./servidor');
  const referenciaServidor = o.referencia ? await require('./referencia').iniciar(o.porta + 2) : null;
  console.log('Subindo o servidor de teste (banco temporário e dados de exemplo)...');
  const s = await iniciar({ porta: o.porta });
  const chrome = await cdp.abrirChrome({ porta: o.porta + 1 });
  const registros = [];
  let status = 0;
  try {
    const aba = await cdp.novaAba(chrome.base);
    const erros = [];
    await aba.enviar('Log.enable');
    aba.aoEvento((m) => {
      if (m.method === 'Runtime.exceptionThrown') erros.push(`${m.params.exceptionDetails.text} ${(m.params.exceptionDetails.exception || {}).description || ''}`.trim().slice(0, 200));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erros.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|net::ERR_INTERNET_DISCONNECTED/.test(m.params.entry.text + m.params.entry.url)) erros.push(`${m.params.entry.text} ${m.params.entry.url || ''}`.trim().slice(0, 200));
    });
    await aba.enviar('Network.enable');
    for (const tela of telas) {
      for (const tam of o.tamanhos) {
        for (const tema of o.temas) {
          const r = await capturar({ aba, s, tela, tam, tema, saidaApp, saidaRef, refUrl: referenciaServidor && referenciaServidor.url, referencia: o.referencia, erros });
          registros.push(r);
          const marca = r.erros.length ? 'ERRO' : 'ok  ';
          console.log(`${marca} ${tam} ${tema} ${tela.id}${r.erros.length ? `  <- ${r.erros[0]}` : ''}`);
          if (r.erros.length) status = 1;
        }
      }
    }
    await cdp.fecharAba(chrome.base, aba);
  } finally {
    await chrome.encerrar();
    if (referenciaServidor) await referenciaServidor.fechar();
    await s.fechar();
  }
  fs.writeFileSync(path.join(o.saida, 'resultado.json'), JSON.stringify(registros, null, 1));
  fs.writeFileSync(path.join(o.saida, 'index.html'), galeria(registros, o));
  if (o.validacao) {
    for (const r of registros) {
      if (!r.app) continue;
      const destino = path.join(VALIDACAO, r.app);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(path.join(saidaApp, r.app), destino);
    }
  }
  console.log(`\n${registros.length} capturas em ${o.saida}\nGaleria: ${path.join(o.saida, 'index.html')}`);
  process.exitCode = status;
}

principal().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error(e.message); process.exit(1); });
