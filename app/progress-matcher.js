(function exposeProgressMatcher(root, factory) {
  const matcher = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = matcher;
  } else {
    root.questProgressMatcher = matcher;
  }
}(typeof globalThis === 'object' ? globalThis : this, () => {
  const normalizeId = (value) => (value || '').toString().replace(/^0x/i, '').toUpperCase();
  const normalizePlugin = (value) => (value || '').toString().trim().toUpperCase();

  const getRecordKey = (plugin, objectId) => {
    const pluginKey = normalizePlugin(plugin);
    const normalizedObjectId = normalizeId(objectId);
    if (!pluginKey || !normalizedObjectId) {
      return '';
    }
    const objectKey = normalizedObjectId.slice(-6).padStart(6, '0');
    return `${pluginKey}:${objectKey}`;
  };

  const buildProgressMaps = (quests) => {
    const byProgressId = new Map();
    const byProgressName = new Map();
    const byFormId = new Map();
    const byRecord = new Map();

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

      const recordKey = getRecordKey(quest.plugin, quest.object_id || formKey);
      if (recordKey && !byRecord.has(recordKey)) {
        byRecord.set(recordKey, quest);
      }
    });

    return { byProgressId, byProgressName, byFormId, byRecord };
  };

  const findProgressQuest = (quest, progressMaps) => {
    if (!quest || !progressMaps) {
      return null;
    }

    const recordKey = getRecordKey(quest.record?.plugin, quest.record?.objectId);
    if (recordKey && progressMaps.byRecord.has(recordKey)) {
      return progressMaps.byRecord.get(recordKey);
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

  const evaluateTrackingRule = (tracking, progressQuest) => {
    if (tracking?.mode !== 'questVariable' || !progressQuest) {
      return false;
    }

    const variableIndex = Number(tracking.variable?.index);
    const variableName = (tracking.variable?.name || '').toUpperCase();
    const variable = (progressQuest.script_variables || []).find((candidate) => {
      return (
        Number(candidate.variable_index) === variableIndex ||
        (variableName && (candidate.name || '').toUpperCase() === variableName)
      );
    });
    if (!variable || typeof variable.value !== 'number') {
      return false;
    }

    const expected = Number(tracking.completeWhen?.value);
    switch (tracking.completeWhen?.operator) {
      case '>=':
        return variable.value >= expected;
      case '>':
        return variable.value > expected;
      case '<=':
        return variable.value <= expected;
      case '<':
        return variable.value < expected;
      case '==':
      case '===':
        return variable.value === expected;
      default:
        return false;
    }
  };

  const isQuestComplete = (quest, progressQuest) => {
    if (!quest || !progressQuest) {
      return false;
    }
    const completionStages = (quest.completionStages || []).filter((value) => value !== null);
    const doneStages = progressQuest.done_stages || [];
    return (
      completionStages.includes(progressQuest.stage) ||
      completionStages.some((completionStage) => doneStages.includes(completionStage)) ||
      evaluateTrackingRule(quest.tracking, progressQuest)
    );
  };

  return {
    buildProgressMaps,
    evaluateTrackingRule,
    findProgressQuest,
    getRecordKey,
    isQuestComplete
  };
}));
