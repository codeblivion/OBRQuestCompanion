const groupList = document.getElementById('group-list');
const questList = document.getElementById('quest-list');
const groupTitle = document.getElementById('group-title');
const groupProgress = document.getElementById('group-progress');
const totalProgress = document.getElementById('total-progress');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const hideCompletedToggle = document.getElementById('hide-completed-toggle');
const hideDescriptionsToggle = document.getElementById('hide-descriptions-toggle');
const trackedCharacterName = document.getElementById('tracked-character-name');
const trackedCharacterLevel = document.getElementById('tracked-character-level');
const trackedCharacterSaveType = document.getElementById('tracked-character-save-type');
const trackedCharacterPlayTimeRow = document.getElementById('tracked-character-play-time-row');
const trackedCharacterSavedRow = document.getElementById('tracked-character-saved-row');
const trackedCharacterSaveTypeRow = document.getElementById('tracked-character-save-type-row');
const trackedCharacterPlayTime = document.getElementById('tracked-character-play-time');
const trackedCharacterSaved = document.getElementById('tracked-character-saved');
const trackedCharacterSnapshot = document.getElementById('tracked-character-snapshot');
const trackedCharacterThumbnailImage = document.getElementById('tracked-character-thumbnail-image');
const trackerStatus = document.getElementById('tracker-status');
const changeCharacterButton = document.getElementById('change-character');
const characterModal = document.getElementById('character-modal');
const closeCharacterModalButton = document.getElementById('close-character-modal');
const cancelCharacterModalButton = document.getElementById('cancel-character-modal');
const saveFolderPath = document.getElementById('save-folder-path');
const saveFolderSummary = document.getElementById('save-folder-summary');
const browseSaveFolderButton = document.getElementById('browse-save-folder');
const characterFilterRow = document.getElementById('character-filter-row');
const characterFilter = document.getElementById('character-filter');
const characterSort = document.getElementById('character-sort');
const characterGrid = document.getElementById('character-grid');
const characterDirectoryState = document.getElementById('character-directory-state');
const trackCharacterButton = document.getElementById('track-character');
const { buildProgressMaps, findProgressQuest, isQuestComplete } = window.questProgressMatcher;
const localDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium'
});

let questData;
let progressData;
let selectedGroupId;
let questOverrides = {};
let saveMetadata = null;
let saveDirectory = null;
let defaultSaveDirectory = null;
let directoryStatus = 'unset';
let directoryError = null;
let trackedCharacterId = null;
let pendingCharacterId = null;
let trackedSaveReadAt = null;
let trackedStatusMessage = null;
let thumbnailUrls = new Map();
let thumbnailRequest = 0;
let preferences = { darkMode: false, hideCompleted: false, hideDescriptions: false };

const getQuestKey = (quest) => quest.id || quest.name || 'unknown';

const getQuestStatus = (quest, progressQuest) => {
  if (getTrackedCharacter() && questOverrides[getQuestKey(quest)]?.completed) {
    return { label: 'Completed', className: 'completed', overridden: true };
  }
  if (!progressQuest) {
    return { label: 'Not Started', className: 'not-started' };
  }
  if (isQuestComplete(quest, progressQuest)) {
    return { label: 'Completed', className: 'completed' };
  }
  if (progressQuest.stage > 0 || progressQuest.started || (progressQuest.script_variables || []).length > 0) {
    return { label: 'In Progress', className: 'in-progress' };
  }
  return { label: 'Not Started', className: 'not-started' };
};

const renderGroups = () => {
  groupList.innerHTML = '';
  if (!questData) {
    groupList.innerHTML = '<div class="empty-state">Quest data not loaded.</div>';
    return;
  }
  const progressQuests = progressData?.quests || [];
  const progressMaps = buildProgressMaps(progressQuests);
  const groups = questData.groups
    .map((group, index) => ({ ...group, _index: index }))
    .sort((left, right) => {
      const leftOrder = Number.isFinite(left.displayOrder) ? left.displayOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.displayOrder) ? right.displayOrder : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left._index - right._index;
    });
  let totalCompleted = 0;
  let totalQuests = 0;
  groups.forEach((group) => {
    const quests = group.quests || [];
    const completedCount = quests.filter((quest) => {
      const match = findProgressQuest(quest, progressMaps, progressQuests);
      return getQuestStatus(quest, match).className === 'completed';
    }).length;
    totalCompleted += completedCount;
    totalQuests += quests.length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `group-card ${group.id === selectedGroupId ? 'active' : ''}`;
    card.addEventListener('click', () => {
      selectedGroupId = group.id;
      renderGroups();
      renderQuests();
    });
    const icon = document.createElement('img');
    icon.alt = `${group.name || group.id || 'Quest group'} icon`;
    icon.src = group.icon || '';
    icon.onerror = () => {
      icon.removeAttribute('src');
      icon.style.background = 'var(--group-icon-bg)';
    };
    const title = document.createElement('h3');
    title.textContent = group.name || group.id || 'Quest Group';
    const progress = document.createElement('div');
    progress.className = 'group-progress';
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${quests.length ? (completedCount / quests.length) * 100 : 0}%`;
    bar.appendChild(fill);
    const progressText = document.createElement('div');
    progressText.className = 'progress-text';
    progressText.textContent = `${completedCount} / ${quests.length}`;
    progress.append(bar, progressText);
    card.append(icon, title, progress);
    groupList.appendChild(card);
  });
  totalProgress.textContent = `${totalCompleted} / ${totalQuests} completed`;
};

const renderQuests = () => {
  questList.innerHTML = '';
  if (!questData) {
    questList.innerHTML = '<div class="empty-state">Quest data not loaded.</div>';
    return;
  }
  const group = questData.groups.find((item) => item.id === selectedGroupId);
  if (!group) {
    groupTitle.textContent = 'Select a quest group';
    groupProgress.textContent = '';
    questList.innerHTML = '<div class="empty-state">Choose a quest group to see details.</div>';
    return;
  }
  const progressQuests = progressData?.quests || [];
  const progressMaps = buildProgressMaps(progressQuests);
  const quests = group.quests || [];
  const isCitiesGroup = group.id === 'Cities';
  const canOverrideQuests = Boolean(getTrackedCharacter());
  let completedCount = 0;
  let shownCount = 0;
  groupTitle.textContent = group.name || group.id || 'Quest Group';
  quests.forEach((quest) => {
    const questKey = getQuestKey(quest);
    const progressQuest = findProgressQuest(quest, progressMaps, progressQuests);
    const status = getQuestStatus(quest, progressQuest);
    if (status.className === 'completed') completedCount += 1;
    if (preferences.hideCompleted && status.className === 'completed') return;

    const item = document.createElement('div');
    item.className = `quest-item quest-item-${status.className}`;
    const content = document.createElement('div');
    const title = document.createElement('h4');
    const titleText = quest.name || quest.editorId || 'Unknown Quest';
    if (quest.link) {
      const link = document.createElement('a');
      link.href = quest.link;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = titleText;
      link.title = 'Open UESP quest article';
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        try { await window.questApi.openExternal(quest.link); } catch (error) {
          console.error('Failed to open quest link', error);
        }
      });
      title.appendChild(link);
    } else {
      title.textContent = titleText;
    }
    const description = document.createElement('p');
    description.className = 'quest-description';
    description.textContent = quest.description || 'No description available.';
    description.classList.toggle('is-hidden', preferences.hideDescriptions);
    const meta = document.createElement('div');
    meta.className = 'quest-meta';
    const statusLabel = document.createElement('span');
    statusLabel.className = `quest-status ${status.className}`;
    statusLabel.textContent = status.label;
    const stageLabel = document.createElement('span');
    stageLabel.textContent = `Stage: ${progressQuest ? progressQuest.stage : 'Not available'}`;
    meta.append(statusLabel, stageLabel);
    const isOverridden = canOverrideQuests && questOverrides[questKey]?.completed;
    if (canOverrideQuests && (isOverridden || status.className !== 'completed')) {
      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.className = 'quest-toggle';
      toggleButton.textContent = isOverridden ? 'Clear Override' : 'Mark Complete';
      toggleButton.setAttribute('aria-label', `Mark ${titleText} as completed`);
      toggleButton.addEventListener('click', async () => {
        questOverrides = await window.questApi.setOverride(questKey, !questOverrides[questKey]?.completed);
        renderGroups();
        renderQuests();
      });
      meta.appendChild(toggleButton);
    }
    content.append(title, description);
    if (isCitiesGroup && quest.city) {
      const city = document.createElement('div');
      city.className = 'quest-city';
      city.textContent = `City: ${quest.city}`;
      content.appendChild(city);
    }
    content.appendChild(meta);
    item.appendChild(content);
    questList.appendChild(item);
    shownCount += 1;
  });
  groupProgress.textContent = `${completedCount} / ${quests.length} completed`;
  if (quests.length && shownCount === 0) {
    questList.innerHTML = '<div class="empty-state">No quests to display with current filters.</div>';
  }
};

const updateProgressData = (payload) => {
  progressData = payload?.data || null;
  renderGroups();
  renderQuests();
};

const resetDisplayedProgress = () => {
  progressData = null;
  trackedSaveReadAt = null;
  renderGroups();
  renderQuests();
};

const showProgressError = (payload) => {
  progressData = null;
  trackedStatusMessage = payload?.message || 'Unable to read quest progress.';
  renderGroups();
  renderQuests();
  renderTrackedCharacter();
};

const formatLocalDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : localDateTimeFormatter.format(date);
};

const formatSaveType = (value) => ({
  manual: 'Manual',
  auto: 'Autosave',
  quick: 'Quicksave'
})[value] || 'Unknown';

const relativeTime = (value) => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 10) return 'just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds} seconds ago`;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
};

const getTrackedCharacter = () =>
  saveMetadata?.characters?.find((character) => character.characterId === trackedCharacterId) || null;

const renderTrackedCharacter = () => {
  const character = getTrackedCharacter();
  const thumbnail = character ? thumbnailUrls.get(character.characterId) : null;
  trackedCharacterSnapshot.classList.toggle('has-snapshot', Boolean(thumbnail));
  trackedCharacterSnapshot.style.backgroundImage = thumbnail ? `url("${thumbnail.url}")` : '';
  trackedCharacterThumbnailImage.hidden = !thumbnail;
  if (thumbnail && trackedCharacterThumbnailImage.getAttribute('src') !== thumbnail.url) {
    trackedCharacterThumbnailImage.src = thumbnail.url;
  } else if (!thumbnail) {
    trackedCharacterThumbnailImage.removeAttribute('src');
  }
  if (!character) {
    trackedCharacterName.textContent = trackedCharacterId ? 'Character not found' : 'No character selected';
    trackedCharacterLevel.textContent = '';
    trackedCharacterSaveType.textContent = '';
    trackedCharacterPlayTimeRow.hidden = true;
    trackedCharacterSavedRow.hidden = true;
    trackedCharacterSaveTypeRow.hidden = true;
    trackerStatus.textContent = trackedStatusMessage || (trackedCharacterId
      ? 'The tracked character was not found in this save folder. Choose another character.'
      : 'Choose a character to begin tracking.');
    return;
  }
  const save = character.latestSave;
  trackedCharacterName.textContent = character.characterName;
  trackedCharacterLevel.textContent = Number.isInteger(save.level) ? `Level ${save.level}` : '';
  trackedCharacterSaveType.textContent = formatSaveType(save.saveType);
  trackedCharacterPlayTime.textContent = save.playTimeDisplay || 'Not available';
  trackedCharacterSaved.textContent = formatLocalDateTime(save.saveDateTimeUtc || save.fileModifiedTimeUtc);
  trackedCharacterPlayTimeRow.hidden = false;
  trackedCharacterSavedRow.hidden = false;
  trackedCharacterSaveTypeRow.hidden = false;
  trackerStatus.textContent = trackedStatusMessage || (trackedSaveReadAt
    ? `Tracking your latest save. Updated ${relativeTime(trackedSaveReadAt)}.`
    : 'Tracking your latest save. Waiting for the next update.');
};

const pathsEqual = (left, right) =>
  typeof left === 'string' && typeof right === 'string' &&
  left.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase() ===
    right.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();

const updateDirectoryStatus = () => {
  if (!saveDirectory) directoryStatus = 'unset';
  else if (directoryError) {
    directoryStatus = directoryError.code === 'ENOENT' && /saves_meta\.sav/i.test(directoryError.message)
      ? 'no-index' : 'error';
  } else if (!saveMetadata) directoryStatus = 'loading';
  else directoryStatus = saveMetadata.characterCount > 0 ? 'ok' : 'empty';
};

const revokeThumbnailUrls = () => {
  thumbnailRequest += 1;
  for (const value of thumbnailUrls.values()) URL.revokeObjectURL(value.url);
  thumbnailUrls = new Map();
};

const loadCharacterThumbnails = async () => {
  const characters = saveMetadata?.characters || [];
  const availableCharacterIds = new Set(characters.map((character) => character.characterId));
  for (const [characterId, thumbnail] of thumbnailUrls) {
    if (availableCharacterIds.has(characterId)) continue;
    URL.revokeObjectURL(thumbnail.url);
    thumbnailUrls.delete(characterId);
  }
  const characterIds = characterModal.hidden
    ? characters.filter((character) => character.characterId === trackedCharacterId)
        .map((character) => character.characterId)
    : characters.map((character) => character.characterId);
  if (characterIds.length === 0) {
    renderTrackedCharacter();
    return;
  }
  const request = ++thumbnailRequest;
  try {
    const thumbnails = await window.questApi.getCharacterThumbnails(characterIds);
    if (request !== thumbnailRequest) return;
    const returnedCharacterIds = new Set(thumbnails.map((item) => item.characterId));
    for (const characterId of characterIds) {
      if (returnedCharacterIds.has(characterId)) continue;
      const previous = thumbnailUrls.get(characterId);
      if (previous) URL.revokeObjectURL(previous.url);
      thumbnailUrls.delete(characterId);
    }
    for (const item of thumbnails) {
      const rawBytes = item.bytes?.data || item.bytes;
      const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes || []);
      if (!bytes.length) continue;
      const previous = thumbnailUrls.get(item.characterId);
      if (previous?.cacheKey === item.cacheKey) continue;
      if (previous) URL.revokeObjectURL(previous.url);
      thumbnailUrls.set(item.characterId, {
        cacheKey: item.cacheKey,
        url: URL.createObjectURL(new Blob([bytes], { type: item.mimeType || 'image/jpeg' }))
      });
    }
    renderTrackedCharacter();
    renderCharacterModal();
  } catch (error) {
    console.error('Failed to load local save thumbnails', error);
  }
};

const compareCharacters = (left, right) => {
  const leftSave = left.latestSave;
  const rightSave = right.latestSave;
  switch (characterSort.value) {
    case 'name':
      return left.characterName.localeCompare(right.characterName, undefined, { sensitivity: 'base' });
    case 'level':
      return (rightSave.level || 0) - (leftSave.level || 0) || left.characterName.localeCompare(right.characterName);
    case 'play-time':
      return (rightSave.playTimeSeconds || 0) - (leftSave.playTimeSeconds || 0) ||
        left.characterName.localeCompare(right.characterName);
    default:
      return (Date.parse(rightSave.saveDateTimeUtc || rightSave.fileModifiedTimeUtc) || 0) -
        (Date.parse(leftSave.saveDateTimeUtc || leftSave.fileModifiedTimeUtc) || 0);
  }
};

const renderCharacterCard = (character) => {
  const save = character.latestSave;
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `character-card${pendingCharacterId === character.characterId ? ' selected' : ''}`;
  card.setAttribute('aria-pressed', pendingCharacterId === character.characterId ? 'true' : 'false');
  const thumbnail = thumbnailUrls.get(character.characterId);
  if (thumbnail) {
    const snapshot = document.createElement('span');
    snapshot.className = 'character-card-snapshot';
    snapshot.style.backgroundImage = `url("${thumbnail.url}")`;
    card.appendChild(snapshot);
  }
  const scrim = document.createElement('span');
  scrim.className = 'character-card-scrim';
  const content = document.createElement('span');
  content.className = 'character-card-content';
  const nameRow = document.createElement('span');
  nameRow.className = 'character-card-name-row';
  const name = document.createElement('span');
  name.className = 'character-card-name';
  name.textContent = character.characterName;
  const level = document.createElement('span');
  level.className = 'character-card-level';
  level.textContent = Number.isInteger(save.level) ? `Level ${save.level}` : '';
  nameRow.append(name, level);
  const type = document.createElement('span');
  type.className = 'character-card-save-type';
  type.textContent = formatSaveType(save.saveType);
  const metadata = document.createElement('span');
  metadata.className = 'character-card-metadata';
  [['Play time', save.playTimeDisplay || 'Not available'], ['Saved', formatLocalDateTime(save.saveDateTimeUtc || save.fileModifiedTimeUtc)], ['File', save.fileName]]
    .forEach(([labelText, valueText]) => {
      const label = document.createElement('span');
      label.textContent = labelText;
      const value = document.createElement('span');
      value.textContent = valueText;
      value.title = valueText;
      metadata.append(label, value);
    });
  const id = document.createElement('span');
  id.className = 'character-card-id';
  id.textContent = character.characterId;
  id.title = character.characterId;
  content.append(nameRow, type, metadata, id);
  card.append(scrim, content);
  card.addEventListener('click', () => {
    pendingCharacterId = character.characterId;
    renderCharacterModal();
  });
  return card;
};

const renderDirectoryState = () => {
  const states = {
    unset: { title: 'Choose your save game folder', body: 'Oblivion Remastered saves usually live under \'Documents\\My Games\\Oblivion Remastered\\Saved\\SaveGames\'. Browse for the folder to detect your characters.', action: null, actionType: null },
    'no-index': { title: 'No save index here', body: "This folder has no saves_meta.sav, so characters can't be detected. Browse for your save game folder.", action: null, actionType: null },
    empty: { title: 'No characters yet', body: 'The save index was read but lists no characters. Save once in game, then rescan.', action: 'Rescan folder', actionType: 'rescan' },
    loading: { title: 'Reading the save index', body: 'Looking for characters and their newest saves in this folder.', action: null, actionType: null },
    error: { title: "Couldn't read the save index", body: 'saves_meta.sav could not be parsed. It may be from a different game version.', action: 'Retry', actionType: 'rescan' }
  };
  const state = states[directoryStatus] || states.error;
  characterDirectoryState.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = state.title;
  const body = document.createElement('p');
  body.textContent = state.body;
  characterDirectoryState.append(title, body);
  if (directoryStatus === 'error' && directoryError?.message) {
    const detail = document.createElement('div');
    detail.className = 'directory-state-detail';
    detail.textContent = directoryError.message;
    characterDirectoryState.appendChild(detail);
  }
  if (state.action) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'primary-button';
    action.textContent = state.action;
    action.addEventListener('click', state.actionType === 'browse' ? browseForSaveFolder : rescanSaveFolder);
    characterDirectoryState.appendChild(action);
  }
};

const renderCharacterModal = () => {
  if (characterModal.hidden) return;
  updateDirectoryStatus();
  saveFolderPath.textContent = saveDirectory || 'No folder selected';
  saveFolderPath.title = saveDirectory || 'No folder selected';
  if (directoryStatus === 'ok') {
    const prefix = pathsEqual(saveDirectory, defaultSaveDirectory) ? 'Auto-detected: ' : '';
    const count = saveMetadata.characterCount;
    saveFolderSummary.textContent = `${prefix}${count} character${count === 1 ? '' : 's'}, ${saveMetadata.saveCount} saves`;
  } else if (directoryStatus === 'loading') {
    saveFolderSummary.textContent = 'Scanning save folder…';
  } else {
    saveFolderSummary.textContent = saveDirectory
      ? 'This folder is not currently providing a readable character list.'
      : 'Choose your save game folder.';
  }
  const showGrid = directoryStatus === 'ok';
  characterFilterRow.hidden = !showGrid;
  characterGrid.hidden = !showGrid;
  characterDirectoryState.hidden = showGrid;
  trackCharacterButton.disabled = !showGrid || !pendingCharacterId;
  if (!showGrid) {
    renderDirectoryState();
    return;
  }
  const filter = characterFilter.value.trim().toLocaleLowerCase();
  const characters = [...saveMetadata.characters]
    .filter((character) => character.characterName.toLocaleLowerCase().includes(filter))
    .sort(compareCharacters);
  characterGrid.innerHTML = '';
  if (characters.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No character names match this filter.';
    characterGrid.appendChild(empty);
    return;
  }
  characters.forEach((character) => characterGrid.appendChild(renderCharacterCard(character)));
};

const openCharacterModal = () => {
  pendingCharacterId = getTrackedCharacter()?.characterId || null;
  characterFilter.value = '';
  characterSort.value = 'last-saved';
  characterModal.hidden = false;
  document.body.classList.add('character-modal-open');
  renderCharacterModal();
  loadCharacterThumbnails();
  setTimeout(() => (directoryStatus === 'ok' ? characterFilter : browseSaveFolderButton).focus(), 0);
};

const closeCharacterModal = () => {
  characterModal.hidden = true;
  document.body.classList.remove('character-modal-open');
  pendingCharacterId = null;
};

async function browseForSaveFolder() {
  browseSaveFolderButton.disabled = true;
  try {
    const result = await window.questApi.chooseSaveDirectory();
    if (result.canceled) return;
    revokeThumbnailUrls();
    saveDirectory = result.directory;
    saveMetadata = result.snapshot;
    directoryError = result.error;
    pendingCharacterId = saveMetadata?.characters?.some((character) => character.characterId === trackedCharacterId)
      ? trackedCharacterId : null;
    if (trackedCharacterId && !saveMetadata?.characters?.some(
      (character) => character.characterId === trackedCharacterId
    )) {
      resetDisplayedProgress();
    }
    updateDirectoryStatus();
    renderTrackedCharacter();
    renderCharacterModal();
    loadCharacterThumbnails();
  } finally {
    browseSaveFolderButton.disabled = false;
  }
}

async function rescanSaveFolder() {
  if (!saveDirectory) return browseForSaveFolder();
  directoryError = null;
  saveMetadata = null;
  updateDirectoryStatus();
  renderCharacterModal();
  try {
    saveMetadata = await window.questApi.startSaveMetadataMonitor(saveDirectory);
  } catch (error) {
    directoryError = { code: error.code || 'SAVE_METADATA_FAILED', message: error.message };
  }
  updateDirectoryStatus();
  renderTrackedCharacter();
  renderCharacterModal();
  loadCharacterThumbnails();
}

const loadQuestData = async () => {
  questData = await window.questApi.readQuestData();
  if (!selectedGroupId && questData?.groups?.length) {
    selectedGroupId = [...questData.groups].sort((left, right) =>
      (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER)
    )[0].id;
  }
  renderGroups();
  renderQuests();
};

const applyPreferences = (nextPreferences) => {
  preferences = { ...preferences, ...(nextPreferences || {}) };
  document.body.classList.toggle('dark-mode', preferences.darkMode);
  darkModeToggle.checked = preferences.darkMode;
  hideCompletedToggle.checked = preferences.hideCompleted;
  hideDescriptionsToggle.checked = preferences.hideDescriptions;
  renderQuests();
};

darkModeToggle.addEventListener('change', () => {
  const darkMode = darkModeToggle.checked;
  window.questApi.setPreferences({ darkMode });
  applyPreferences({ darkMode });
});
hideCompletedToggle.addEventListener('change', () => {
  const hideCompleted = hideCompletedToggle.checked;
  window.questApi.setPreferences({ hideCompleted });
  applyPreferences({ hideCompleted });
});
hideDescriptionsToggle.addEventListener('change', () => {
  const hideDescriptions = hideDescriptionsToggle.checked;
  window.questApi.setPreferences({ hideDescriptions });
  applyPreferences({ hideDescriptions });
});

changeCharacterButton.addEventListener('click', openCharacterModal);
closeCharacterModalButton.addEventListener('click', closeCharacterModal);
cancelCharacterModalButton.addEventListener('click', closeCharacterModal);
browseSaveFolderButton.addEventListener('click', browseForSaveFolder);
characterFilter.addEventListener('input', renderCharacterModal);
characterSort.addEventListener('change', renderCharacterModal);
characterModal.addEventListener('click', (event) => {
  if (event.target === characterModal) closeCharacterModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!characterModal.hidden) closeCharacterModal();
});
trackCharacterButton.addEventListener('click', async () => {
  if (!pendingCharacterId) return;
  trackCharacterButton.disabled = true;
  const previousTrackedCharacterId = trackedCharacterId;
  const previousQuestOverrides = questOverrides;
  try {
    trackedCharacterId = pendingCharacterId;
    if (trackedCharacterId !== previousTrackedCharacterId) {
      questOverrides = {};
      renderGroups();
      renderQuests();
    }
    trackedStatusMessage = 'Reading the newest save…';
    renderTrackedCharacter();
    const result = await window.questApi.setTrackedCharacter(trackedCharacterId);
    try {
      questOverrides = await window.questApi.readOverrides() || {};
    } catch (error) {
      questOverrides = {};
      console.error('Failed to read quest overrides for the tracked character', error);
    }
    if (result?.data) {
      updateProgressData({ data: result.data });
      trackedSaveReadAt = result.readAtUtc;
      trackedStatusMessage = null;
    }
    renderGroups();
    renderQuests();
    closeCharacterModal();
    renderTrackedCharacter();
  } catch (error) {
    trackedCharacterId = previousTrackedCharacterId;
    questOverrides = previousQuestOverrides;
    trackedStatusMessage = `Unable to track character: ${error.message}`;
    renderGroups();
    renderQuests();
    renderTrackedCharacter();
    trackCharacterButton.disabled = false;
  }
});

window.questApi.onProgressUpdated(updateProgressData);
window.questApi.onProgressError(showProgressError);
window.questApi.onSaveMetadataUpdated((snapshot) => {
  saveMetadata = snapshot;
  saveDirectory = snapshot.directory;
  directoryError = null;
  updateDirectoryStatus();
  if (trackedCharacterId && !getTrackedCharacter()) {
    resetDisplayedProgress();
  }
  renderTrackedCharacter();
  renderCharacterModal();
  if (!getTrackedCharacter() && trackedCharacterId && characterModal.hidden) openCharacterModal();
  else loadCharacterThumbnails();
});
window.questApi.onSaveMetadataError((error) => {
  saveDirectory = error.directory || saveDirectory;
  directoryError = error;
  if (trackedCharacterId && ['ENOENT', 'ENOTDIR'].includes(error.code)) {
    saveMetadata = null;
    trackedStatusMessage = 'The tracked save folder is no longer available.';
    resetDisplayedProgress();
    renderTrackedCharacter();
  }
  updateDirectoryStatus();
  renderCharacterModal();
});
window.questApi.onTrackedSaveLoading(() => {
  trackedStatusMessage = 'Reading the newest save…';
  renderTrackedCharacter();
});
window.questApi.onTrackedSaveRead((payload) => {
  trackedSaveReadAt = payload.readAtUtc;
  trackedStatusMessage = null;
  renderTrackedCharacter();
});
window.questApi.onTrackedSaveError((payload) => {
  if (payload.code === 'CHARACTER_NOT_FOUND') {
    resetDisplayedProgress();
  }
  trackedStatusMessage = payload.willRetry
    ? 'Newest save is still being written. Retrying…'
    : `Could not read newest save: ${payload.message}`;
  renderTrackedCharacter();
});
const registerExternalLinks = () => {
  document.querySelectorAll('[data-external-link]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const href = link.getAttribute('href');
      if (href) await window.questApi.openExternal(href);
    });
  });
};

const initialize = async () => {
  const [status, savedCharacterId, savedPreferences, savedOverrides, version] = await Promise.all([
    window.questApi.getSaveMetadataStatus(),
    window.questApi.getTrackedCharacterId(),
    window.questApi.getPreferences(),
    window.questApi.readOverrides(),
    window.appInfo.version()
  ]);
  saveDirectory = status.directory;
  saveMetadata = status.snapshot;
  directoryError = status.error;
  trackedCharacterId = savedCharacterId;
  defaultSaveDirectory = await window.questApi.getDefaultSaveDirectory();
  questOverrides = savedOverrides || {};
  applyPreferences(savedPreferences);
  document.getElementById('app-version').textContent = `v${version}`;
  updateDirectoryStatus();
  renderTrackedCharacter();
  loadCharacterThumbnails();
  await loadQuestData();
  if (trackedCharacterId && getTrackedCharacter()) {
    const result = await window.questApi.refreshTrackedCharacter();
    if (result?.data) {
      updateProgressData({ data: result.data });
      trackedSaveReadAt = result.readAtUtc;
      trackedStatusMessage = null;
      renderTrackedCharacter();
    }
  } else {
    openCharacterModal();
  }
};

setInterval(renderTrackedCharacter, 30 * 1000);
registerExternalLinks();
initialize().catch((error) => {
  console.error('Application initialization failed', error);
  trackedStatusMessage = `Initialization failed: ${error.message}`;
  renderTrackedCharacter();
  openCharacterModal();
});
