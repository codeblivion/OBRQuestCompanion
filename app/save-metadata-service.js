const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { parseSaveMetadata } = require('./save-metadata-reader');

const METADATA_FILE_NAME = 'saves_meta.sav';
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;
const DEFAULT_DEBOUNCE_MS = 500;
const MAX_METADATA_FILE_SIZE = 32 * 1024 * 1024;
const THUMBNAIL_CACHE = Symbol('saveThumbnailCache');

const formatPlayTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  const padTimePart = (value) => value.toString().padStart(2, '0');
  return `${padTimePart(hours)}h ${padTimePart(minutes)}m ${padTimePart(remainder)}s`;
};

const collectSaveMetadata = async (directory) => {
  if (typeof directory !== 'string' || !directory.trim()) {
    throw new TypeError('A save directory is required.');
  }

  const resolvedDirectory = path.resolve(directory.trim());
  const directoryStats = await fs.promises.stat(resolvedDirectory);
  if (!directoryStats.isDirectory()) {
    throw new Error('The save path is not a directory.');
  }

  const metadataPath = path.join(resolvedDirectory, METADATA_FILE_NAME);
  const [metadataStats, directoryEntries] = await Promise.all([
    fs.promises.stat(metadataPath),
    fs.promises.readdir(resolvedDirectory, { withFileTypes: true })
  ]);
  if (!metadataStats.isFile()) {
    throw new Error(`${METADATA_FILE_NAME} is not a file.`);
  }
  if (metadataStats.size > MAX_METADATA_FILE_SIZE) {
    throw new Error(`${METADATA_FILE_NAME} is larger than the ${MAX_METADATA_FILE_SIZE}-byte safety limit.`);
  }

  const filesByBaseName = new Map();
  for (const entry of directoryEntries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.sav') {
      continue;
    }
    filesByBaseName.set(path.basename(entry.name, path.extname(entry.name)).toLowerCase(), entry.name);
  }

  const parsed = parseSaveMetadata(await fs.promises.readFile(metadataPath));
  const availableSaves = [];
  const thumbnailsBySlot = new Map();
  let unavailableSaveCount = 0;

  for (const save of parsed.saves) {
    if (!save.characterId || !save.characterName || !save.slotName) {
      unavailableSaveCount += 1;
      continue;
    }

    const fileName = filesByBaseName.get(save.slotName.toLowerCase());
    if (!fileName || fileName.toLowerCase() === METADATA_FILE_NAME) {
      unavailableSaveCount += 1;
      continue;
    }

    const filePath = path.join(resolvedDirectory, fileName);
    const stats = await fs.promises.stat(filePath);
    const { thumbnail, ...publicSave } = save;
    if (Buffer.isBuffer(thumbnail)) {
      thumbnailsBySlot.set(save.slotName.toLowerCase(), thumbnail);
    }
    availableSaves.push({
      ...publicSave,
      fileName,
      filePath,
      fileSize: stats.size,
      fileModifiedTimeUtc: stats.mtime.toISOString(),
      playTimeDisplay: formatPlayTime(save.playTimeSeconds)
    });
  }

  const characterMap = new Map();
  for (const save of availableSaves) {
    let character = characterMap.get(save.characterId);
    if (!character) {
      character = {
        characterId: save.characterId,
        characterName: save.characterName,
        saves: []
      };
      characterMap.set(save.characterId, character);
    }
    character.saves.push(save);
  }

  const compareNewestFirst = (left, right) => {
    const leftTime = Date.parse(left.saveDateTimeUtc || left.fileModifiedTimeUtc) || 0;
    const rightTime = Date.parse(right.saveDateTimeUtc || right.fileModifiedTimeUtc) || 0;
    return rightTime - leftTime || right.fileModifiedTimeUtc.localeCompare(left.fileModifiedTimeUtc);
  };

  const characters = [...characterMap.values()]
    .map((character) => {
      character.saves.sort(compareNewestFirst);
      return {
        characterId: character.characterId,
        characterName: character.characterName,
        saveCount: character.saves.length,
        latestSave: character.saves[0],
        saves: character.saves
      };
    })
    .sort((left, right) =>
      left.characterName.localeCompare(right.characterName, undefined, { sensitivity: 'base' }) ||
      left.characterId.localeCompare(right.characterId)
    );

  const indexedFileNames = new Set(availableSaves.map((save) => save.fileName.toLowerCase()));
  const gameplayFileNames = [...filesByBaseName.values()].filter(
    (fileName) => ![METADATA_FILE_NAME, 'save_settings.sav'].includes(fileName.toLowerCase())
  );
  const unindexedSaveCount = gameplayFileNames.filter(
    (fileName) => !indexedFileNames.has(fileName.toLowerCase())
  ).length;

  const revisionSource = JSON.stringify({
    metadataSize: metadataStats.size,
    metadataModified: metadataStats.mtimeMs,
    saves: availableSaves.map((save) => [
      save.fileName,
      save.fileSize,
      save.fileModifiedTimeUtc,
      save.characterId,
      save.saveDateTimeUtc
    ])
  });

  const snapshot = {
    directory: resolvedDirectory,
    collectedAtUtc: new Date().toISOString(),
    revision: crypto.createHash('sha256').update(revisionSource).digest('hex'),
    metadataFile: {
      fileName: METADATA_FILE_NAME,
      filePath: metadataPath,
      fileSize: metadataStats.size,
      fileModifiedTimeUtc: metadataStats.mtime.toISOString()
    },
    characterCount: characters.length,
    saveCount: availableSaves.length,
    unavailableSaveCount,
    unindexedSaveCount,
    characters
  };
  const thumbnailCache = new Map();
  for (const character of characters) {
    const bytes = thumbnailsBySlot.get(character.latestSave.slotName.toLowerCase());
    if (!bytes) {
      continue;
    }
    thumbnailCache.set(character.characterId, {
      cacheKey: [
        character.characterId,
        character.latestSave.slotName,
        character.latestSave.saveDateTimeUtc || character.latestSave.fileModifiedTimeUtc
      ].join(':'),
      mimeType: 'image/jpeg',
      bytes
    });
  }
  Object.defineProperty(snapshot, THUMBNAIL_CACHE, {
    value: thumbnailCache,
    enumerable: false
  });
  return snapshot;
};

class SaveMetadataMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.collect = options.collect || collectSaveMetadata;
    this.pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.directory = null;
    this.snapshot = null;
    this.watcher = null;
    this.pollTimer = null;
    this.debounceTimer = null;
    this.inFlight = null;
    this.refreshAgain = false;
    this.retryCount = 0;
    this.generation = 0;
    this.thumbnailCache = new Map();
  }

  async start(directory) {
    this.stop();
    const resolvedDirectory = path.resolve(directory);
    const stats = await fs.promises.stat(resolvedDirectory);
    if (!stats.isDirectory()) {
      throw new Error('The save path is not a directory.');
    }

    this.directory = resolvedDirectory;
    this.generation += 1;
    try {
      this.watcher = fs.watch(resolvedDirectory, { persistent: false }, (_eventType, fileName) => {
        const changedName = fileName ? fileName.toString().toLowerCase() : '';
        if (!changedName || changedName.endsWith('.sav')) {
          this.requestRefresh();
        }
      });
      this.watcher.on('error', (error) => this.emit('collector-error', error));
    } catch (error) {
      this.emit('collector-error', error);
    }

    this.pollTimer = setInterval(() => {
      this.refresh().catch(() => {});
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();

    return this.refresh({ force: true, throwOnError: true });
  }

  requestRefresh(delay = this.debounceMs) {
    if (!this.directory) {
      return;
    }
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refresh().catch(() => {});
    }, delay);
    this.debounceTimer.unref?.();
  }

  async refresh(options = {}) {
    if (!this.directory) {
      return null;
    }
    if (this.inFlight) {
      this.refreshAgain = true;
      return this.inFlight;
    }

    const generation = this.generation;
    const directory = this.directory;
    this.inFlight = (async () => {
      try {
        const snapshot = await this.collect(directory);
        if (generation !== this.generation || directory !== this.directory) {
          return null;
        }
        const changed = options.force || snapshot.revision !== this.snapshot?.revision;
        this.snapshot = snapshot;
        this.thumbnailCache = snapshot[THUMBNAIL_CACHE] || new Map();
        this.retryCount = 0;
        if (changed) {
          this.emit('update', snapshot);
        }
        return snapshot;
      } catch (error) {
        if (generation === this.generation) {
          this.emit('collector-error', error);
          this.retryCount += 1;
          if (this.retryCount <= 3) {
            this.requestRefresh(1000);
          }
        }
        if (options.throwOnError) {
          throw error;
        }
        return null;
      }
    })();

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
      if (this.refreshAgain) {
        this.refreshAgain = false;
        this.requestRefresh(0);
      }
    }
  }

  stop() {
    this.generation += 1;
    this.watcher?.close();
    clearInterval(this.pollTimer);
    clearTimeout(this.debounceTimer);
    this.watcher = null;
    this.pollTimer = null;
    this.debounceTimer = null;
    this.directory = null;
    this.snapshot = null;
    this.refreshAgain = false;
    this.retryCount = 0;
    this.thumbnailCache = new Map();
  }

  getCharacterThumbnails(characterIds = []) {
    if (!Array.isArray(characterIds) || characterIds.length > 100) {
      throw new TypeError('Character thumbnail request must contain at most 100 IDs.');
    }
    return characterIds.flatMap((characterId) => {
      const normalizedId = typeof characterId === 'string' ? characterId.toLowerCase() : '';
      const thumbnail = this.thumbnailCache.get(normalizedId);
      return thumbnail
        ? [{
            characterId: normalizedId,
            cacheKey: thumbnail.cacheKey,
            mimeType: thumbnail.mimeType,
            bytes: Uint8Array.from(thumbnail.bytes)
          }]
        : [];
    });
  }
}

module.exports = {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_POLL_INTERVAL_MS,
  METADATA_FILE_NAME,
  THUMBNAIL_CACHE,
  SaveMetadataMonitor,
  collectSaveMetadata,
  formatPlayTime
};
