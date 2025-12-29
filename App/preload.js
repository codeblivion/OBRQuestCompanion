const { app, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('questApi', {
  readQuestData: () => ipcRenderer.invoke('read-quest-data'),
  readProgress: () => ipcRenderer.invoke('read-progress'),
  setProgressPath: (filePath) => ipcRenderer.invoke('set-progress-path', filePath),
  getProgressPath: () => ipcRenderer.invoke('get-progress-path'),
  getDefaultProgressPath: () => ipcRenderer.invoke('get-default-progress-path'),
  readOverrides: () => ipcRenderer.invoke('read-overrides'),
  setOverride: (questKey, completed) => ipcRenderer.invoke('set-override', questKey, completed),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  setPreferences: (updates) => ipcRenderer.invoke('set-preferences', updates),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onProgressUpdated: (callback) => {
    ipcRenderer.on('progress-updated', (_event, payload) => callback(payload));
  },
  onProgressError: (callback) => {
    ipcRenderer.on('progress-error', (_event, payload) => callback(payload));
  }
});

contextBridge.exposeInMainWorld('appInfo', {
  version: () => ipcRenderer.invoke('get-app-version')
});