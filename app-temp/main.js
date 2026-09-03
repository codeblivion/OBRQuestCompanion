const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { readSaveProgressFromFile } = require('./save-reader-service');
const { SaveMetadataMonitor, collectSaveMetadata } = require('./save-metadata-service');
const {
  getOverridesForCharacter,
  normalizeOverridesByCharacter,
  setOverrideForCharacter
} = require('./override-settings');

let mainWindow;
let progressPath;
let progressWatcher;
let progressInterval;
let trackedCharacterId = null;
let trackedSaveKey = null;
let trackedSaveRead = null;
let trackedReadToken = 0;
let trackedReadRetryTimer = null;
let saveMetadataError = null;
const saveMetadataMonitor = new SaveMetadataMonitor();

const PROGRESS_POLL_INTERVAL_MS = 60 * 1000;
const DEFAULT_PREFERENCES = {
  darkMode: false,
  hideCompleted: false,
  hideDescriptions: false
};

const sendToRenderer = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
};

const findTrackedCharacter = (snapshot = saveMetadataMonitor.snapshot) =>
  snapshot?.characters?.find((character) => character.characterId === trackedCharacterId) || null;

const resetTrackedProgress = () => {
  trackedSaveKey = null;
  trackedSaveRead = null;
  trackedReadToken += 1;
  clearTimeout(trackedReadRetryTimer);
  trackedReadRetryTimer = null;
  sendToRenderer('progress-updated', { path: null, data: null });
};

const refreshTrackedCharacterProgress = async ({ force = false, retry = 0 } = {}) => {
  clearTimeout(trackedReadRetryTimer);
  trackedReadRetryTimer = null;

  if (!trackedCharacterId) {
    return null;
  }

  const character = findTrackedCharacter();
  const latestSave = character?.latestSave;
  if (!latestSave?.filePath) {
    resetTrackedProgress();
    sendToRenderer('tracked-save-error', {
      characterId: trackedCharacterId,
      code: 'CHARACTER_NOT_FOUND',
      message: 'The tracked character is not present in this save folder.'
    });
    return null;
  }

  const saveKey = [
    trackedCharacterId,
    latestSave.filePath,
    latestSave.fileSize,
    latestSave.fileModifiedTimeUtc,
    latestSave.saveDateTimeUtc
  ].join(':');
  if (!force && saveKey === trackedSaveKey) {
    return trackedSaveRead;
  }

  const token = ++trackedReadToken;
  sendToRenderer('tracked-save-loading', {
    characterId: trackedCharacterId,
    save: latestSave
  });

  try {
    const data = await readSaveProgressFromFile(latestSave.filePath);
    if (token !== trackedReadToken || trackedCharacterId !== character.characterId) {
      return null;
    }
    trackedSaveKey = saveKey;
    trackedSaveRead = {
      characterId: trackedCharacterId,
      save: latestSave,
      readAtUtc: new Date().toISOString(),
      data
    };
    sendToRenderer('progress-updated', { path: latestSave.filePath, data });
    sendToRenderer('tracked-save-read', {
      characterId: trackedCharacterId,
      save: latestSave,
      readAtUtc: trackedSaveRead.readAtUtc
    });
    return trackedSaveRead;
  } catch (error) {
    if (token !== trackedReadToken) {
      return null;
    }
    if (retry < 3) {
      trackedReadRetryTimer = setTimeout(() => {
        refreshTrackedCharacterProgress({ force: true, retry: retry + 1 }).catch(() => {});
      }, 1000);
      trackedReadRetryTimer.unref?.();
    }
    sendToRenderer('tracked-save-error', {
      characterId: trackedCharacterId,
      save: latestSave,
      code: error.code || 'SAVE_READ_FAILED',
      message: error.message,
      willRetry: retry < 3
    });
    return null;
  }
};

saveMetadataMonitor.on('update', (snapshot) => {
  saveMetadataError = null;
  sendToRenderer('save-metadata-updated', snapshot);
  refreshTrackedCharacterProgress().catch((error) => {
    console.error('Tracked save refresh error:', error);
  });
});

saveMetadataMonitor.on('collector-error', (error) => {
  console.error('Save metadata collection error:', error);
  saveMetadataError = {
    directory: saveMetadataMonitor.directory,
    code: error.code || 'SAVE_METADATA_FAILED',
    message: error.message
  };
  if (trackedCharacterId && ['ENOENT', 'ENOTDIR'].includes(saveMetadataError.code)) {
    resetTrackedProgress();
  }
  sendToRenderer('save-metadata-error', saveMetadataError);
});

const readJsonFile = async (filePath) => {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(content);
};

const sendProgressUpdate = async () => {
  if (!mainWindow || !progressPath) {
    return false;
  }

  try {
    const progressData = await readJsonFile(progressPath);
    mainWindow.webContents.send('progress-updated', {
      path: progressPath,
      data: progressData
    });
    return true;
  } catch (error) {
    mainWindow.webContents.send('progress-error', {
      path: progressPath,
      message: error.message
    });
    return false;
  }
};

const clearProgressWatchers = () => {
  if (progressWatcher) {
    progressWatcher.close();
    progressWatcher = undefined;
  }

  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = undefined;
  }
};

const setProgressPath = async (filePath) => {
  const normalizedPath =
    typeof filePath === 'string' && filePath.trim() ? path.resolve(filePath.trim()) : null;
  progressPath = normalizedPath;
  clearProgressWatchers();

  if (!progressPath) {
    if (mainWindow) {
      mainWindow.webContents.send('progress-updated', { path: null, data: null });
    }
    return null;
  }

  const initialLoadSucceeded = await sendProgressUpdate();
  if (!initialLoadSucceeded) {
    progressPath = null;
    return null;
  }

  try {
    progressWatcher = fs.watch(progressPath, { persistent: false }, () => {
      sendProgressUpdate();
    });
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send('progress-error', {
        path: progressPath,
        message: error.message
      });
    }
  }

  progressInterval = setInterval(() => {
    sendProgressUpdate();
  }, PROGRESS_POLL_INTERVAL_MS);

  return progressPath;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    backgroundColor: '#cbb78e',
    icon: path.join(__dirname, 'images', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

const progressPathStatePath = () => path.join(app.getPath('userData'), 'quest_progress_path.json');
const userSettingsPath = () => path.join(app.getPath('userData'), 'user_settings.json');

const normalizePreferences = (preferences) => ({
  ...DEFAULT_PREFERENCES,
  ...(preferences || {})
});

const normalizeSettings = (settings) => ({
  progressPath:
    typeof settings?.progressPath === 'string' && settings.progressPath.trim()
      ? settings.progressPath.trim()
      : null,
  saveDirectory:
    typeof settings?.saveDirectory === 'string' && settings.saveDirectory.trim()
      ? settings.saveDirectory.trim()
      : null,
  trackedCharacterId:
    typeof settings?.trackedCharacterId === 'string' && settings.trackedCharacterId.trim()
      ? settings.trackedCharacterId.trim().toLowerCase()
      : null,
  overridesByCharacter: normalizeOverridesByCharacter(settings?.overridesByCharacter),
  preferences: normalizePreferences(settings?.preferences)
});

const readLegacyProgressPath = async () => {
  try {
    const content = await fs.promises.readFile(progressPathStatePath(), 'utf-8');
    const data = JSON.parse(content);
    if (typeof data?.path === 'string' && data.path.trim()) {
      return data.path.trim();
    }
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const readUserSettings = async () => {
  try {
    const content = await fs.promises.readFile(userSettingsPath(), 'utf-8');
    return normalizeSettings(JSON.parse(content));
  } catch (error) {
    if (error.code === 'ENOENT') {
      const legacyProgressPath = await readLegacyProgressPath();
      return normalizeSettings({
        progressPath: legacyProgressPath
      });
    }
    throw error;
  }
};

const writeUserSettings = async (settings) => {
  const normalizedSettings = normalizeSettings(settings || {});
  await fs.promises.mkdir(path.dirname(userSettingsPath()), { recursive: true });
  await fs.promises.writeFile(
    userSettingsPath(),
    JSON.stringify(normalizedSettings, null, 2),
    'utf-8'
  );
  return normalizedSettings;
};

const readQuestData = async () => {
  const questDataDir = path.join(app.getAppPath(), 'quest_data');
  let entries;

  try {
    entries = await fs.promises.readdir(questDataDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { groups: [] };
    }
    throw error;
  }

  const groups = [];

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      continue;
    }

    const filePath = path.join(questDataDir, entry.name);

    try {
      const groupData = await readJsonFile(filePath);
      if (groupData) {
        groups.push(groupData);
      }
    } catch (error) {
      console.error(`Failed to read quest data from ${filePath}:`, error);
    }
  }

  groups.sort((a, b) => {
    const orderA = Number.isFinite(a?.displayOrder) ? a.displayOrder : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(b?.displayOrder) ? b.displayOrder : Number.MAX_SAFE_INTEGER;
    if (orderA === orderB) {
      return (a?.name || '').localeCompare(b?.name || '');
    }
    return orderA - orderB;
  });

  return { groups };
};

const defaultSaveDirectoryCandidates = () => {
  const documents = app.getPath('documents');
  return [
    path.join(documents, 'My Games', 'Oblivion Remastered', 'Saved', 'SaveGames'),
    path.join(documents, 'My Games', 'Oblivion Remastered', 'SaveGames')
  ];
};

const getDefaultSaveDirectory = async () => {
  const candidates = defaultSaveDirectoryCandidates();
  for (const candidate of candidates) {
    try {
      const stats = await fs.promises.stat(candidate);
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return null;
};

const startSaveMetadataMonitor = async (directory) => {
  if (typeof directory !== 'string' || !directory.trim()) {
    throw new TypeError('A save directory is required.');
  }
  const resolvedDirectory = path.resolve(directory.trim());
  saveMetadataError = null;
  const settings = await readUserSettings();
  await writeUserSettings({ ...settings, saveDirectory: resolvedDirectory });
  const snapshot = await saveMetadataMonitor.start(resolvedDirectory);
  return snapshot;
};

app.whenReady().then(async () => {
  const settings = await readUserSettings();
  trackedCharacterId = settings.trackedCharacterId;
  await writeUserSettings(settings);
  createWindow();
  const saveDirectory = settings.saveDirectory || await getDefaultSaveDirectory();
  if (saveDirectory) {
    try {
      await startSaveMetadataMonitor(saveDirectory);
    } catch (error) {
      console.warn(`Save metadata monitor did not start for ${saveDirectory}:`, error.message);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  clearTimeout(trackedReadRetryTimer);
  clearProgressWatchers();
  saveMetadataMonitor.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('read-quest-data', async () => {
  return readQuestData();
});

ipcMain.handle('read-progress', async () => {
  if (!progressPath) {
    return null;
  }
  try {
    return await readJsonFile(progressPath);
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send('progress-error', {
        path: progressPath,
        message: error.message
      });
    }
    return null;
  }
});

ipcMain.handle('read-save-progress', async (_event, filePath) => {
  return readSaveProgressFromFile(filePath);
});

ipcMain.handle('collect-save-metadata', async (_event, directory) => {
  return collectSaveMetadata(directory);
});

ipcMain.handle('start-save-metadata-monitor', async (_event, directory) => {
  return startSaveMetadataMonitor(directory);
});

ipcMain.handle('stop-save-metadata-monitor', async () => {
  saveMetadataMonitor.stop();
  saveMetadataError = null;
  const settings = await readUserSettings();
  await writeUserSettings({ ...settings, saveDirectory: null });
  return true;
});

ipcMain.handle('get-save-metadata', () => {
  return saveMetadataMonitor.snapshot;
});

ipcMain.handle('get-save-directory', () => {
  return saveMetadataMonitor.directory;
});

ipcMain.handle('get-save-metadata-status', async () => {
  const settings = await readUserSettings();
  return {
    directory: saveMetadataMonitor.directory || settings.saveDirectory,
    snapshot: saveMetadataMonitor.snapshot,
    error: saveMetadataError
  };
});

ipcMain.handle('get-default-save-directory', () => {
  return getDefaultSaveDirectory();
});

ipcMain.handle('choose-save-directory', async () => {
  const defaultPath = saveMetadataMonitor.directory || await getDefaultSaveDirectory();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Oblivion Remastered SaveGames folder',
    defaultPath: defaultPath || app.getPath('documents'),
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const directory = result.filePaths[0];
  try {
    const snapshot = await startSaveMetadataMonitor(directory);
    return { canceled: false, directory, snapshot, error: null };
  } catch (error) {
    return {
      canceled: false,
      directory,
      snapshot: null,
      error: { code: error.code || 'SAVE_METADATA_FAILED', message: error.message }
    };
  }
});

ipcMain.handle('get-character-thumbnails', (_event, characterIds) => {
  return saveMetadataMonitor.getCharacterThumbnails(characterIds);
});

ipcMain.handle('get-tracked-character-id', () => trackedCharacterId);

ipcMain.handle('set-tracked-character', async (_event, characterId) => {
  const normalizedId = typeof characterId === 'string' && characterId.trim()
    ? characterId.trim().toLowerCase()
    : null;
  if (normalizedId && !saveMetadataMonitor.snapshot?.characters?.some(
    (character) => character.characterId === normalizedId
  )) {
    throw new Error('That character is not present in the current save folder.');
  }

  const settings = await readUserSettings();
  await writeUserSettings({
    ...settings,
    progressPath: null,
    trackedCharacterId: normalizedId
  });
  trackedCharacterId = normalizedId;
  trackedSaveKey = null;
  trackedSaveRead = null;
  trackedReadToken += 1;
  clearTimeout(trackedReadRetryTimer);
  clearProgressWatchers();
  progressPath = null;
  sendToRenderer('progress-updated', { path: null, data: null });
  return normalizedId ? refreshTrackedCharacterProgress({ force: true }) : null;
});

ipcMain.handle('refresh-tracked-character', () => {
  return refreshTrackedCharacterProgress({ force: true });
});

ipcMain.handle('set-progress-path', async (_event, filePath) => {
  const settings = await readUserSettings();
  const normalizedPath = typeof filePath === 'string' && filePath.trim() ? filePath.trim() : null;

  settings.progressPath = normalizedPath;
  await writeUserSettings(settings);

  const effectivePath = await setProgressPath(normalizedPath);
  return effectivePath;
});

ipcMain.handle('get-progress-path', async () => {
  const settings = await readUserSettings();
  return settings.progressPath || null;
});

ipcMain.handle('get-default-progress-path', () => {
  return null;
});

ipcMain.handle('read-overrides', async () => {
  const settings = await readUserSettings();
  return getOverridesForCharacter(settings.overridesByCharacter, trackedCharacterId);
});

ipcMain.handle('set-override', async (_event, questKey, completed) => {
  const settings = await readUserSettings();
  const overridesByCharacter = setOverrideForCharacter(
    settings.overridesByCharacter,
    trackedCharacterId,
    questKey,
    completed
  );
  const updatedSettings = await writeUserSettings({
    ...settings,
    overridesByCharacter
  });
  return getOverridesForCharacter(updatedSettings.overridesByCharacter, trackedCharacterId);
});

ipcMain.handle('get-preferences', async () => {
  const settings = await readUserSettings();
  return settings.preferences;
});

ipcMain.handle('set-preferences', async (_event, updates) => {
  const settings = await readUserSettings();
  const updatedSettings = await writeUserSettings({
    ...settings,
    preferences: normalizePreferences({
      ...settings.preferences,
      ...(updates || {})
    })
  });
  return updatedSettings.preferences;
});

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !url.trim()) {
    return false;
  }
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
