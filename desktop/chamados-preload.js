// Preload mínimo da tela do Chamados dentro da Suíte: só a troca de tela. Roda isolado (sandbox) e só expõe
// a ponte se a página for da origem do Chamados configurada pelo app (recebida na linha de comando da view).
const { contextBridge, ipcRenderer } = require('electron');

const PREFIX = '--chamados-origin=';
const arg = process.argv.find((item) => item.startsWith(PREFIX));
const origin = arg ? arg.slice(PREFIX.length) : '';
const TARGETS = ['centro', 'orcamentos', 'chamados'];

if (origin && location.origin === origin) {
  contextBridge.exposeInMainWorld('electronAPI', {
    suiteAvailable: true,
    suiteSwitch: (target) => (TARGETS.includes(target)
      ? ipcRenderer.invoke('suite:switch', target)
      : Promise.resolve({ switched: false })),
  });
}
