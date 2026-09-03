const { app, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('questApi', {
  readQuestData: () => ipcRenderer.invoke('read-quest-data'),
  readProgress: () => ipcRenderer.invoke('read-progress'),
  readSaveProgress: (filePath) => ipcRenderer.invoke('read-save-progress', filePath),
  collectSaveMetadata: (directory) => ipcRenderer.invoke('collect-save-metadata', directory),
  startSaveMetadataMonitor: (directory) => ipcRenderer.invoke('start-save-metadata-monitor', directory),
  stopSaveMetadataMonitor: () => ipcRenderer.invoke('stop-save-metadata-monitor'),
  getSaveMetadata: () => ipcRenderer.invoke('get-save-metadata'),
  getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
  getSaveMetadataStatus: () => ipcRenderer.invoke('get-save-metadata-status'),
  getDefaultSaveDirectory: () => ipcRenderer.invoke('get-default-save-directory'),
  chooseSaveDirectory: () => ipcRenderer.invoke('choose-save-directory'),
  getCharacterThumbnails: (characterIds) => ipcRenderer.invoke('get-character-thumbnails', characterIds),
  getTrackedCharacterId: () => ipcRenderer.invoke('get-tracked-character-id'),
  setTrackedCharacter: (characterId) => ipcRenderer.invoke('set-tracked-character', characterId),
  refreshTrackedCharacter: () => ipcRenderer.invoke('refresh-tracked-character'),
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
  },
  onSaveMetadataUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('save-metadata-updated', listener);
    return () => ipcRenderer.removeListener('save-metadata-updated', listener);
  },
  onSaveMetadataError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('save-metadata-error', listener);
    return () => ipcRenderer.removeListener('save-metadata-error', listener);
  },
  onTrackedSaveLoading: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tracked-save-loading', listener);
    return () => ipcRenderer.removeListener('tracked-save-loading', listener);
  },
  onTrackedSaveRead: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tracked-save-read', listener);
    return () => ipcRenderer.removeListener('tracked-save-read', listener);
  },
  onTrackedSaveError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tracked-save-error', listener);
    return () => ipcRenderer.removeListener('tracked-save-error', listener);
  }
});

contextBridge.exposeInMainWorld('appInfo', {
  version: () => ipcRenderer.invoke('get-app-version')
});
