const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require("electron-updater");

function setupUpdates() {
  autoUpdater.autoDownload = true;

  autoUpdater.on("error", (e) => console.error("update error", e));
  autoUpdater.on("update-available", () => console.log("update available"));
  autoUpdater.on("update-downloaded", () => {
    console.log("update downloaded, installing");
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdatesAndNotify();
}

let mainWindow;
let progressPath;
let progressWatcher;
let progressInterval;

const PROGRESS_POLL_INTERVAL_MS = 60 * 1000;
const DEFAULT_PREFERENCES = {
  darkMode: false,
  hideCompleted: false,
  hideDescriptions: false
};

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

const overridesPath = () => path.join(app.getPath('userData'), 'quest_overrides.json');
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
  overrides: settings?.overrides && typeof settings.overrides === 'object' ? settings.overrides : {},
  preferences: normalizePreferences(settings?.preferences)
});

const readLegacyOverrides = async () => {
  try {
    const content = await fs.promises.readFile(overridesPath(), 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
};

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
      const legacyOverrides = await readLegacyOverrides();
      const legacyProgressPath = await readLegacyProgressPath();
      return normalizeSettings({
        overrides: legacyOverrides,
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

app.whenReady().then(async () => {
  setupUpdates();
  createWindow();
  const settings = await readUserSettings();
  await writeUserSettings(settings);
  if (settings.progressPath) {
    await setProgressPath(settings.progressPath);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  clearProgressWatchers();
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
  return settings.overrides;
});

ipcMain.handle('set-override', async (_event, questKey, completed) => {
  const settings = await readUserSettings();
  const overrides = settings.overrides;
  if (completed) {
    overrides[questKey] = { completed: true, updatedAt: new Date().toISOString() };
  } else {
    delete overrides[questKey];
  }
  const updatedSettings = await writeUserSettings({
    ...settings,
    overrides
  });
  return updatedSettings.overrides;
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