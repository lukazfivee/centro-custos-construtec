const { autoUpdater } = require('electron-updater');
const path = require('path');

let state = {
  status: 'idle',
  info: null,
  progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
  error: null
};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.forceDevUpdateConfig = false;
autoUpdater.logger = null;

autoUpdater.on('checking-for-update', () => {
  state = { ...state, status: 'checking', error: null };
});

autoUpdater.on('update-available', (info) => {
  state = { ...state, status: 'available', info: { version: info.version, releaseNotes: info.releaseNotes || '' }, error: null };
});

autoUpdater.on('update-not-available', () => {
  state = { ...state, status: 'not-available', info: null, error: null };
});

autoUpdater.on('download-progress', (progress) => {
  state = { ...state, status: 'downloading', progress: { percent: Math.round(progress.percent), bytesPerSecond: progress.bytesPerSecond, transferred: progress.transferred, total: progress.total } };
});

autoUpdater.on('update-downloaded', () => {
  state = { ...state, status: 'downloaded' };
});

autoUpdater.on('error', (err) => {
  state = { ...state, status: 'error', error: err.message };
});

module.exports = {
  autoUpdater,
  getState: () => ({ ...state }),
  check: () => autoUpdater.checkForUpdates(),
  download: () => autoUpdater.downloadUpdate(),
  install: () => autoUpdater.quitAndInstall(false, true)
};
