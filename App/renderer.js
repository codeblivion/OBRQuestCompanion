const groupList = document.getElementById('group-list');
const questList = document.getElementById('quest-list');
const groupTitle = document.getElementById('group-title');
const groupProgress = document.getElementById('group-progress');
const totalProgress = document.getElementById('total-progress');
const pathInput = document.getElementById('progress-path');
const loadButton = document.getElementById('load-progress');
const pathStatus = document.getElementById('path-status');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const hideCompletedToggle = document.getElementById('hide-completed-toggle');
const hideDescriptionsToggle = document.getElementById('hide-descriptions-toggle');

let questData;
let progressData;
let selectedGroupId;
let questOverrides = {};
let preferences = {
  darkMode: false,
  hideCompleted: false,
  hideDescriptions: false
};

const normalizeId = (value) => (value || '').toString().replace(/^0x/i, '').toUpperCase();

const getQuestKey = (quest) => {
  return (
    quest.id ||
    quest.name ||
    'unknown'
  );
};

const buildProgressMaps = (quests) => {
  const byProgressId = new Map();
  const byProgressName = new Map();
  const byFormId = new Map();

  quests.forEach((quest) => {
    const idKey = (quest.id || '').toUpperCase();
    if (idKey && !byProgressId.has(idKey)) {
      byProgressId.set(idKey, quest);
    }

    const nameKey = (quest.name || '').toUpperCase();
    if (nameKey && !byProgressName.has(nameKey)) {
      byProgressName.set(nameKey, quest);
    }

    const formKey = normalizeId(quest.form_id);
    if (formKey && !byFormId.has(formKey)) {
      byFormId.set(formKey, quest);
    }
  });

  return { byProgressId, byProgressName, byFormId };
};

const findProgressQuest = (quest, progressMaps, progressList) => {
  if (!quest || !progressMaps) {
    return null;
  }

  const questId = (quest.id || '').toUpperCase();
  if (questId && progressMaps.byProgressName.has(questId)) {
    return progressMaps.byProgressName.get(questId);
  }

  if (questId && progressMaps.byProgressId.has(questId)) {
    return progressMaps.byProgressId.get(questId);
  }

  return null;
};

const getQuestStatus = (quest, progressQuest) => {
  const override = questOverrides[getQuestKey(quest)];
  if (override?.completed) {
    return { label: 'Completed', className: 'completed', overridden: true };
  }

  if (!progressQuest) {
    return { label: 'Not Started', className: 'not-started' };
  }

  const stage = progressQuest.stage;
  const completionStages = (quest.completionStages || []).filter((value) => value !== null);

  if (completionStages.includes(stage)) {
    return { label: 'Completed', className: 'completed' };
  }

  if (stage > 0) {
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
    .sort((a, b) => {
      const orderA = Number.isFinite(a.displayOrder) ? a.displayOrder : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(b.displayOrder) ? b.displayOrder : Number.MAX_SAFE_INTEGER;
      if (orderA === orderB) {
        return a._index - b._index;
      }
      return orderA - orderB;
    });

  let totalCompleted = 0;
  let totalQuests = 0;

  groups.forEach((group) => {
    const quests = group.quests || [];
    const questStates = quests.map((quest) => {
      const progressQuest = findProgressQuest(quest, progressMaps, progressQuests);
      return getQuestStatus(quest, progressQuest);
    });

    const completedCount = questStates.filter((state) => state.className === 'completed').length;
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
      icon.style.background = '#e7d6b3';
    };

    const title = document.createElement('h3');
    title.textContent = group.name || group.id || 'Quest Group';

    const progress = document.createElement('div');
    progress.className = 'group-progress';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';

    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    const percent = quests.length ? (completedCount / quests.length) * 100 : 0;
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);

    const progressText = document.createElement('div');
    progressText.className = 'progress-text';
    progressText.textContent = `${completedCount} / ${quests.length}`;

    progress.appendChild(bar);
    progress.appendChild(progressText);

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(progress);

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

  groupTitle.textContent = group.name || group.id || 'Quest Group';
  const isCitiesGroup = group.id === 'Cities';

  const quests = group.quests || [];
  let completedCount = 0;
  let shownCount = 0;

  quests.forEach((quest) => {
    const questKey = getQuestKey(quest);
    const progressQuest = findProgressQuest(quest, progressMaps, progressQuests);
    const status = getQuestStatus(quest, progressQuest);

    if (status.className === 'completed') {
      completedCount += 1;
    }
    if (preferences.hideCompleted && status.className === 'completed') {
      return;
    }

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
        try {
          await window.questApi.openExternal(quest.link);
        } catch (error) {
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
    if (preferences.hideDescriptions) {
      description.classList.add('is-hidden');
    }

    const meta = document.createElement('div');
    meta.className = 'quest-meta';

    const statusLabel = document.createElement('span');
    statusLabel.className = `quest-status ${status.className}`;
    statusLabel.textContent = status.label;

    const stageLabel = document.createElement('span');
    stageLabel.textContent = `Stage: ${progressQuest ? progressQuest.stage : '—'}`;

    meta.appendChild(statusLabel);
    meta.appendChild(stageLabel);

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'quest-toggle';
    const isOverridden = questOverrides[questKey]?.completed;
    toggleButton.textContent = isOverridden ? 'Clear Override' : 'Mark Complete';
    toggleButton.setAttribute('aria-label', `Mark ${quest.name || quest.editorId || 'quest'} as completed`);
    toggleButton.addEventListener('click', async () => {
      const nextCompleted = !questOverrides[questKey]?.completed;
      questOverrides = await window.questApi.setOverride(questKey, nextCompleted);
      renderGroups();
      renderQuests();
    });

    if (isOverridden || status.className !== 'completed') { 
      meta.appendChild(toggleButton);
    }

    content.appendChild(title);
    content.appendChild(description);
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

const updateLastRefresh = () => {
  const timestamp = progressData?.generated_at_utc;
  pathStatus.textContent = timestamp ? `Progress updated at ${timestamp}` : 'No quest progress loaded.';
};

const updateProgressData = (payload) => {
  progressData = payload?.data || null;
  updateLastRefresh();
  renderGroups();
  renderQuests();
};

const showProgressError = (payload) => {
  progressData = null;
  const message = payload?.message || 'Unable to read quest progress file.';
  pathStatus.textContent = message;
  renderGroups();
  renderQuests();
};

const loadQuestData = async () => {
  questData = await window.questApi.readQuestData();
  if (!selectedGroupId && questData?.groups?.length) {
    const sortedGroups = questData.groups
      .map((group, index) => ({ ...group, _index: index }))
      .sort((a, b) => {
        const orderA = Number.isFinite(a.displayOrder) ? a.displayOrder : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(b.displayOrder) ? b.displayOrder : Number.MAX_SAFE_INTEGER;
        if (orderA === orderB) {
          return a._index - b._index;
        }
        return orderA - orderB;
      });
    selectedGroupId = sortedGroups[0].id;
  }
  renderGroups();
  renderQuests();
};

const loadOverrides = async () => {
  questOverrides = (await window.questApi.readOverrides()) || {};
  renderGroups();
  renderQuests();
};

const applyDarkMode = (enabled) => {
  document.body.classList.toggle('dark-mode', enabled);
  darkModeToggle.checked = enabled;
};

const applyPreferences = (nextPreferences) => {
  preferences = {
    ...preferences,
    ...(nextPreferences || {})
  };
  applyDarkMode(preferences.darkMode);
  hideCompletedToggle.checked = preferences.hideCompleted;
  hideDescriptionsToggle.checked = preferences.hideDescriptions;
  renderQuests();
};

const loadPreferences = async () => {
  const savedPreferences = await window.questApi.getPreferences();
  applyPreferences(savedPreferences);
};

loadButton.addEventListener('click', async () => {
  const filePath = pathInput.value.trim();
  if (!filePath) {
    pathStatus.textContent = 'Enter a quest progress file path first.';
    return;
  }
  await window.questApi.setProgressPath(filePath);
});

darkModeToggle.addEventListener('change', () => {
  const enabled = darkModeToggle.checked;
  window.questApi.setPreferences({ darkMode: enabled });
  applyPreferences({ darkMode: enabled });
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

window.questApi.onProgressUpdated(updateProgressData);
window.questApi.onProgressError(showProgressError);

const registerExternalLinks = () => {
  const externalLinks = document.querySelectorAll('[data-external-link]');
  externalLinks.forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const href = link.getAttribute('href');
      if (!href) {
        return;
      }
      try {
        await window.questApi.openExternal(href);
      } catch (error) {
        console.error('Failed to open external link', error);
      }
    });
  });
};

const loadInitialProgress = async () => {
  pathStatus.textContent = 'No quest progress loaded.';
  try {
    const savedPath = await window.questApi.getProgressPath();
    pathInput.value = savedPath || '';
    const initialProgress = await window.questApi.readProgress();
    if (initialProgress) {
      updateProgressData({ data: initialProgress });
    }
  } catch (error) {
    pathStatus.textContent = `Unable to read progress file: ${error.message}`;
  }
};

const loadVersionInfo = async () => {
  const version = await window.appInfo.version();
  const versionSpan = document.getElementById('app-version');
  if (versionSpan) {
    versionSpan.textContent = `v${version}`;
  }
};

loadVersionInfo();
loadInitialProgress();
loadQuestData();
loadOverrides();
loadPreferences();
registerExternalLinks();
