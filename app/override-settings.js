const normalizeOverrideMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(([, override]) =>
      override && typeof override === 'object' && override.completed === true
    )
  );
};

const normalizeOverridesByCharacter = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([characterId, overrides]) => [characterId.trim().toLowerCase(), normalizeOverrideMap(overrides)])
      .filter(([characterId, overrides]) => characterId && Object.keys(overrides).length > 0)
  );
};

const getOverridesForCharacter = (overridesByCharacter, characterId) => {
  const normalizedCharacterId = typeof characterId === 'string' ? characterId.trim().toLowerCase() : '';
  if (!normalizedCharacterId) {
    return {};
  }
  return { ...(normalizeOverridesByCharacter(overridesByCharacter)[normalizedCharacterId] || {}) };
};

const setOverrideForCharacter = (
  overridesByCharacter,
  characterId,
  questKey,
  completed,
  updatedAt = new Date().toISOString()
) => {
  const normalizedCharacterId = typeof characterId === 'string' ? characterId.trim().toLowerCase() : '';
  if (!normalizedCharacterId) {
    throw new Error('A tracked character is required to change quest overrides.');
  }
  if (typeof questKey !== 'string' || !questKey.trim()) {
    throw new TypeError('A quest key is required to change a quest override.');
  }

  const result = normalizeOverridesByCharacter(overridesByCharacter);
  const characterOverrides = { ...(result[normalizedCharacterId] || {}) };
  if (completed) {
    characterOverrides[questKey] = { completed: true, updatedAt };
  } else {
    delete characterOverrides[questKey];
  }

  if (Object.keys(characterOverrides).length > 0) {
    result[normalizedCharacterId] = characterOverrides;
  } else {
    delete result[normalizedCharacterId];
  }
  return result;
};

module.exports = {
  getOverridesForCharacter,
  normalizeOverridesByCharacter,
  setOverrideForCharacter
};
