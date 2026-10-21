// Tela "Chamados e O.S." da Suíte do Windows: uma WebContentsView da mesma janela, com sessão própria e
// persistente, que só navega dentro da origem configurada. Entra pelo código de uso único (handoff).
const { requestChamadosHandoff, sameOrigin, externalAllowed } = require('./chamados-navigation.cjs');

const PARTITION = 'persist:suite-chamados';
const ABORTED = -3; // ERR_ABORTED: a própria página trocou de endereço durante a carga; não é falha.

// electron: { WebContentsView, session, shell, dialog }; host: { getWindow, module, port, readToken, preload, fetcher }.
function createChamadosView({ electron, host }) {
  const { WebContentsView, session, shell, dialog } = electron;
  let view = null;
  let loadedToken = null;

  const live = () => (view && !view.webContents.isDestroyed() ? view : null);
  const origin = () => host.module.origin;

  function external(url) {
    if (externalAllowed(url)) void shell.openExternal(url);
  }

  function lockDown(contents) {
    contents.setWindowOpenHandler(({ url }) => {
      if (sameOrigin(url, origin())) void contents.loadURL(url).catch(() => {});
      else external(url);
      return { action: 'deny' };
    });
    const guard = (event, url) => {
      if (sameOrigin(url, origin()) || url === 'about:blank') return;
      event.preventDefault();
      external(url);
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.on('will-attach-webview', (event) => event.preventDefault());
    const ses = contents.session;
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
  }

  function ensureView() {
    if (live()) return view;
    const window = host.getWindow();
    if (!window || window.isDestroyed()) return null;
    view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false,
        session: session.fromPartition(PARTITION), preload: host.preload,
        additionalArguments: ['--chamados-origin=' + origin()],
      },
    });
    view.setBackgroundColor('#fefefe');
    view.setVisible(false);
    window.contentView.addChildView(view);
    host.onCreate?.(view); // atalhos comuns da Suíte; as regras de navegação abaixo valem por último
    lockDown(view.webContents);
    return view;
  }

  async function clearSession() {
    loadedToken = null;
    const contents = live()?.webContents;
    if (contents) await contents.loadURL('about:blank').catch(() => {});
    await session.fromPartition(PARTITION).clearStorageData().catch(() => {});
  }

  // O Chamados é um PWA e o service worker dele só troca de versão quando todas as telas fecham, o que nunca acontece
  // numa janela de app que fica aberta. Na primeira carga de cada execução o app descarta o service worker e o cache dele
  // (o login e os rascunhos do técnico ficam em outro armazenamento e não são tocados): assim o visual novo sempre entra.
  let shellRefreshed = false;
  async function refreshShell() {
    if (shellRefreshed) return;
    shellRefreshed = true;
    await session.fromPartition(PARTITION).clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});
  }

  async function load(url) {
    await refreshShell();
    const contents = live().webContents;
    // Trocar só o # não recarrega o documento: sai da página antiga antes, para o código novo valer.
    await contents.loadURL('about:blank').catch(() => {});
    try { await contents.loadURL(url); } catch (error) {
      if (error?.errno !== ABORTED && error?.code !== 'ERR_ABORTED') throw error;
    }
  }

  async function askRetry(detail) {
    const answer = await dialog.showMessageBox(host.getWindow(), {
      type: 'warning', title: 'Chamados não abriu', message: 'Não foi possível abrir o Chamados e O.S.', detail,
      buttons: ['Tentar de novo', 'Cancelar'], defaultId: 0, cancelId: 1, noLink: true,
    });
    return answer.response === 0;
  }

  // Abre (ou só mostra, se a conta é a mesma e a tela já carregou) o Chamados. { switched } como as outras telas.
  async function open() {
    if (!origin()) {
      dialog.showErrorBox('Chamados indisponível', 'O Chamados não está configurado nesta instalação.');
      return { switched: false };
    }
    for (;;) {
      const token = await host.readToken();
      if (!token) {
        await clearSession();
        dialog.showErrorBox('Chamados', 'Entre no Centro de Custos antes de abrir o Chamados.');
        return { switched: false };
      }
      if (!ensureView()) return { switched: false };
      const contents = view.webContents;
      if (loadedToken === token && sameOrigin(contents.getURL(), origin())) return { switched: true };
      if (loadedToken && loadedToken !== token) await clearSession();
      const handoff = await requestChamadosHandoff({ module: host.module, port: host.port, token, fetcher: host.fetcher });
      let message = handoff.message;
      if (handoff.ok) {
        try {
          await load(handoff.url);
          loadedToken = token;
          return { switched: true };
        } catch { message = 'Sem conexão com o Chamados. Verifique a internet e tente de novo.'; }
      }
      if (!(await askRetry(message))) return { switched: false };
    }
  }

  // Só a página do Chamados (quadro principal, na origem configurada) fala com o app por IPC.
  function isSender(event) {
    const contents = live()?.webContents;
    return Boolean(contents && event.sender === contents && event.senderFrame === contents.mainFrame
      && sameOrigin(event.senderFrame.url, origin()));
  }

  return { open, isSender, view: live, clearSession };
}

module.exports = { createChamadosView, PARTITION };
