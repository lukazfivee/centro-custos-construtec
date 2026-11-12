#!/usr/bin/env node
// Captura a Central de Ajuda do Desktop novo (/d/) em cada aba, claro e escuro, 1440x900 e 1280x720.
//   node scripts/conferencia/ajuda-captura.js [pasta-de-saida]
// Dados temporarios do servidor.js (inventados); nada toca AppData, Neon ou Cloudflare.
const path = require('node:path');
const fs = require('node:fs');
const { iniciar, PESSOAS } = require('./servidor');
const cdp = require('./cdp');

const saida = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'docs', 'suite-desktop', 'validacao', '_ajuda'));
const ABAS = ['atalhos', 'regras', 'perfis', 'sobre', 'reportar'];

(async () => {
  fs.mkdirSync(saida, { recursive: true });
  const s = await iniciar({ porta: 3241 });
  const chrome = await cdp.abrirChrome({ porta: 9471 });
  const problemas = [];
  try {
    const usuario = { id: s.ids.admin, nome: PESSOAS.admin.nome, email: PESSOAS.admin.email, role: 'admin' };
    for (const [w, h] of [[1440, 900], [1280, 720]]) for (const tema of ['claro', 'escuro']) {
      const aba = await cdp.novaAba(chrome.base);
      await aba.tamanho(w, h);
      await aba.esquemaDeCor(tema);
      await aba.aoAbrir(`try{localStorage.setItem('cc_token',${JSON.stringify(s.tokens.admin)});localStorage.setItem('cc_usuario',${JSON.stringify(JSON.stringify(usuario))});localStorage.setItem('cc_instancia',${JSON.stringify(JSON.stringify(s.instancia))});localStorage.setItem('cc_d_tema','${tema}');localStorage.setItem('cc_d_menu','aberto');}catch(e){}`);
      await aba.ir(`${s.url}/d/`);
      await aba.esperar("document.querySelector('#conteudo') && document.querySelector('#conteudo').children.length", 12000);
      await aba.avaliar('document.fonts.ready.then(() => true)');
      if (!(await aba.avaliar("!!document.querySelector('[data-ajuda]')"))) { problemas.push(`${w}x${h} ${tema}: sem botao de ajuda`); await cdp.fecharAba(chrome.base, aba); continue; }
      await aba.clicar('[data-ajuda]');
      await aba.esperar("document.querySelector('.aj-dlg')", 3000);
      for (const k of ABAS) {
        await aba.clicar(`[data-aj-aba="${k}"]`);
        await aba.esperar('true', 300);
        const med = await aba.avaliar(`(() => { const d = document.querySelector('.aj-dlg'); const c = document.querySelector('.aj-corpo'); const r = d.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, rolagem: c.scrollHeight > c.clientHeight + 1, cabeNaTela: r.bottom <= innerHeight && r.right <= innerWidth && r.top >= 0, horizontal: document.documentElement.scrollWidth > innerWidth, abas: [...document.querySelectorAll('.aj-abas button')].length }; })()`);
        if (!med.cabeNaTela) problemas.push(`${w}x${h} ${tema} ${k}: dialogo nao cabe na tela`);
        if (med.horizontal) problemas.push(`${w}x${h} ${tema} ${k}: rolagem horizontal`);
        await aba.print(path.join(saida, `${w}x${h}-${tema}-${k}.png`), { formato: 'png' });
        console.log(`${w}x${h} ${tema} ${k}: ${Math.round(med.w)}x${Math.round(med.h)} rolagem-interna=${med.rolagem}`);
      }
      await aba.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await aba.esperar("!document.querySelector('.aj-dlg')", 1500);
      if (await aba.avaliar("!!document.querySelector('.aj-dlg')")) problemas.push(`${w}x${h} ${tema}: Esc nao fechou`);
      await cdp.fecharAba(chrome.base, aba);
    }
  } finally {
    await chrome.encerrar();
    await s.fechar();
  }
  console.log(problemas.length ? `PROBLEMAS:\n${problemas.join('\n')}` : 'sem problemas');
  process.exit(problemas.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
