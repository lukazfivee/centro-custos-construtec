// X1: Centro x Orcamentos lado a lado no Desktop novo. So 127.0.0.1 (3261-3268), dados ficticios dos dois kits.
// uso: node comparar.mjs <saida> [telas=inicio] [tamanhos] [temas]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const require = createRequire(import.meta.url);
const saida = path.resolve(process.argv[2] || 'C:/x1-tools/saida');
const TAMANHOS = (process.argv[4] || '1280x720,1280x800,1440x900').split(',');
const TEMAS = (process.argv[5] || 'claro,escuro').split(',');
const TELAS = (process.argv[3] || 'inicio').split(',');
mkdirSync(saida, { recursive: true });
const tmp = path.join(saida, '.tmp'); mkdirSync(tmp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp;
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...a) { if (a[0] === 0) a[0] = 3263; return listen.apply(this, a); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const { subirAmbiente } = await import('file:///C:/orc-t-x1/scripts/conferencia/ambiente.mjs');
const { abrirNavegador } = await import('file:///C:/orc-t-x1/scripts/conferencia/cdp.mjs');
const { AJUDANTES } = await import('file:///C:/orc-t-x1/scripts/conferencia/acoes.mjs');
const orc = await subirAmbiente({ portaApi: 3265, portaCentro: 3266, portaSite: 3267 });
for (const k of ['DATABASE_URL', 'SYNC_API_URL', 'REPORT_API_URL']) process.env[k] = '';
process.env.NODE_ENV = 'test';
const cc = await require('C:/cc-t-x1/scripts/conferencia/servidor.js').iniciar({ porta: 3261 });
const nav = await abrirNavegador({ porta: 3268 });

const MEDIR = `(() => {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const m = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), fs: +(parseFloat(c.fontSize) * z).toFixed(1), fw: c.fontWeight, ff: c.fontFamily.split(',')[0].replace(/"/g, ''), cor: c.color, fundo: c.backgroundColor, borda: c.borderBottomColor + ' ' + c.borderBottomWidth + '/' + c.borderRightColor + ' ' + c.borderRightWidth, raio: c.borderRadius, pad: c.padding, ls: c.letterSpacing, txt: (e.innerText || '').trim().slice(0, 30) }; };
  return { zoom: z, fsVar: getComputedStyle(document.documentElement).getPropertyValue('--fs'),
    side: m('.side'), marca: m('.side .marca'), logo: m('.side .logo'), grupo: m('.side .grupo'), grupoRot: m('.side .grupo > span'),
    item: m('.side .nav a:not(.ativo):not([aria-current]), .side .nav button:not(.ativo):not([aria-current])'),
    ativo: m('.side .nav .ativo, .side .nav [aria-current="page"]'), badge: m('.side .badge'), quem: m('.side .quem'), avatar: m('.side .avatar'), nome: m('.side .quem .nome'), recolher: m('.side .recolher'),
    top: m('.top'), busca: m('.top .busca'), suite: m('.top .suite'), ibtn: m('.top .ibtn'), ponto: m('.top .ponto'),
    h1: m('h1'), eyebrow: m('.cab .eyebrow, .grupo-pag, .page-head .eyebrow, .home-header .eyebrow, .cab small, .cab > div > span'),
    corpo: { fundo: getComputedStyle(document.body).backgroundColor } };
})()`;

async function capturar(app, tam, tema, tela) {
  const [w, h] = tam.split('x').map(Number);
  const aba = await nav.novaAba(); await aba.viewport(w, h, false);
  if (app === 'centro') {
    const p = cc.PESSOAS.admin;
    const usuario = { id: cc.ids.admin, nome: p.nome, email: p.email, role: 'admin' };
    await aba.antesDoCarregamento(`try{localStorage.setItem('cc_token',${JSON.stringify(cc.tokens.admin)});localStorage.setItem('cc_usuario',${JSON.stringify(JSON.stringify(usuario))});localStorage.setItem('cc_instancia',${JSON.stringify(JSON.stringify(cc.instancia))});localStorage.setItem('cc_d_tema','${tema}');localStorage.setItem('cc_d_menu','aberto');}catch(e){}`);
    await aba.ir(`${cc.url}/d/#/${({ listas: 'lancamentos', config: 'config', cadastro: 'fornecedores' })[tela] || tela}`);
  } else {
    await aba.antesDoCarregamento(`${AJUDANTES}\ntry{localStorage.setItem('construtec.auth.session',${JSON.stringify(orc.token)});localStorage.setItem('orc_d_tema','${tema}');sessionStorage.setItem('construtec.auth.centro','1');sessionStorage.setItem('orc_versao','completa');}catch(e){}`);
    await aba.ir(`${orc.base}/`);
    const rot = ({ listas: 'Propostas', config: 'Configurações', cadastro: 'Clientes' })[tela];
    if (rot) { await esperar(2500); await aba.avaliar(`window.__conf.clicar(${JSON.stringify(rot)}, '.side', 0)`); }
  }
  await esperar(app === 'centro' ? 3500 : 3000);
  const arq = path.join(saida, `${tam}-${tema}-${tela}-${app}.png`);
  await aba.foto(arq);
  const med = await aba.avaliar(MEDIR);
  await aba.fechar();
  return { arq, med };
}

const R = [];
try {
  for (const tela of TELAS) for (const tam of TAMANHOS) for (const tema of TEMAS) {
    const a = await capturar('centro', tam, tema, tela); const b = await capturar('orcamentos', tam, tema, tela);
    // Composicao lado a lado (Centro | Orcamentos) numa pagina local, capturada pelo mesmo Chrome.
    const [w, h] = tam.split('x').map(Number);
    const img = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    const html = `<html><body style="margin:0;display:flex;gap:8px;background:#888;font:600 14px sans-serif"><figure style="margin:0"><figcaption style="padding:4px 8px;background:#222;color:#fff">Centro de Custos · ${tam} · ${tema}</figcaption><img src="${img(a.arq)}"></figure><figure style="margin:0"><figcaption style="padding:4px 8px;background:#222;color:#fff">Orçamentos · ${tam} · ${tema}</figcaption><img src="${img(b.arq)}"></figure></body></html>`;
    const pagina = path.join(tmp, 'lado.html'); writeFileSync(pagina, html);
    const aba = await nav.novaAba(); await aba.viewport(w * 2 + 8, h + 26, false); await aba.ir(`file:///${pagina.replace(/\\/g, '/')}`); await esperar(500);
    await aba.foto(path.join(saida, `lado-${tam}-${tema}-${tela}.png`)); await aba.fechar();
    R.push({ tela, tam, tema, centro: a.med, orcamentos: b.med });
    console.log(`ok ${tela} ${tam} ${tema}`);
  }
} catch (e) { console.error('ERRO', e.stack); } finally {
  writeFileSync(path.join(saida, 'medidas.json'), JSON.stringify(R, null, 1));
  nav.fechar(); await orc.fechar(); await cc.fechar(); process.exit(0);
}
