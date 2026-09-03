const GVAS_MAGIC = 'GVAS';
const SAVE_METADATA_TYPE = '/Script/Altar.VAltarSaveMetaData';
const WINDOWS_EPOCH_TICKS = 621355968000000000n;
const TICKS_PER_MILLISECOND = 10000n;
const TICKS_PER_SECOND = 10000000;
const MAX_THUMBNAIL_SIZE = 8 * 1024 * 1024;

class BinaryReader {
  constructor(data) {
    this.data = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.position = 0;
  }

  ensureAvailable(size) {
    if (!Number.isSafeInteger(size) || size < 0 || this.position + size > this.data.length) {
      throw new Error(`Metadata read at 0x${this.position.toString(16)} exceeds the ${this.data.length}-byte file.`);
    }
  }

  readUInt8() {
    this.ensureAvailable(1);
    const value = this.data.readUInt8(this.position);
    this.position += 1;
    return value;
  }

  readInt8() {
    this.ensureAvailable(1);
    const value = this.data.readInt8(this.position);
    this.position += 1;
    return value;
  }

  readUInt16() {
    this.ensureAvailable(2);
    const value = this.data.readUInt16LE(this.position);
    this.position += 2;
    return value;
  }

  readUInt32() {
    this.ensureAvailable(4);
    const value = this.data.readUInt32LE(this.position);
    this.position += 4;
    return value;
  }

  readInt32() {
    this.ensureAvailable(4);
    const value = this.data.readInt32LE(this.position);
    this.position += 4;
    return value;
  }

  readUInt64() {
    this.ensureAvailable(8);
    const value = this.data.readBigUInt64LE(this.position);
    this.position += 8;
    return value;
  }

  readInt64() {
    this.ensureAvailable(8);
    const value = this.data.readBigInt64LE(this.position);
    this.position += 8;
    return value;
  }

  readFloat32() {
    this.ensureAvailable(4);
    const value = this.data.readFloatLE(this.position);
    this.position += 4;
    return value;
  }

  readString() {
    const length = this.readInt32();
    if (length === 0) {
      return '';
    }

    if (length > 0) {
      this.ensureAvailable(length);
      const end = this.position + length;
      const textEnd = this.data[end - 1] === 0 ? end - 1 : end;
      const value = this.data.toString('utf8', this.position, textEnd);
      this.position = end;
      return value;
    }

    const codeUnits = -length;
    const byteLength = codeUnits * 2;
    this.ensureAvailable(byteLength);
    const end = this.position + byteLength;
    const textEnd = codeUnits > 0 && this.data.readUInt16LE(end - 2) === 0 ? end - 2 : end;
    const value = this.data.toString('utf16le', this.position, textEnd);
    this.position = end;
    return value;
  }

  readGuid() {
    const a = this.readUInt32();
    const b = this.readUInt32();
    const c = this.readUInt32();
    const d = this.readUInt32();
    const bBytes = Buffer.allocUnsafe(4);
    const cBytes = Buffer.allocUnsafe(4);
    bBytes.writeUInt32LE(b);
    cBytes.writeUInt32LE(c);
    return (
      a.toString(16).padStart(8, '0') +
      `-${bBytes[3].toString(16).padStart(2, '0')}${bBytes[2].toString(16).padStart(2, '0')}` +
      `-${bBytes[1].toString(16).padStart(2, '0')}${bBytes[0].toString(16).padStart(2, '0')}` +
      `-${cBytes[3].toString(16).padStart(2, '0')}${cBytes[2].toString(16).padStart(2, '0')}` +
      `-${cBytes[1].toString(16).padStart(2, '0')}${cBytes[0].toString(16).padStart(2, '0')}${d.toString(16).padStart(8, '0')}`
    );
  }

  skip(size) {
    this.ensureAvailable(size);
    this.position += size;
  }
}

const engineHasPropertyGuids = (header) =>
  header.engineMajor > 4 || (header.engineMajor === 4 && header.engineMinor >= 12);

const readHeader = (reader) => {
  reader.ensureAvailable(4);
  const magic = reader.data.toString('ascii', reader.position, reader.position + 4);
  reader.position += 4;
  if (magic !== GVAS_MAGIC) {
    throw new Error(`Expected ${GVAS_MAGIC}, found ${JSON.stringify(magic)}.`);
  }

  const saveGameVersion = reader.readUInt32();
  const packageVersionUe4 = reader.readUInt32();
  const packageVersionUe5 = saveGameVersion >= 3 && saveGameVersion !== 34 ? reader.readUInt32() : 0;
  const engineMajor = reader.readUInt16();
  const engineMinor = reader.readUInt16();
  const enginePatch = reader.readUInt16();
  const engineBuild = reader.readUInt32();
  const engineBranch = reader.readString();

  if (engineMajor > 4 || (engineMajor === 4 && engineMinor >= 12)) {
    reader.readUInt32();
    const customVersionCount = reader.readUInt32();
    if (customVersionCount > 4096) {
      throw new Error(`Unreasonable GVAS custom-version count: ${customVersionCount}.`);
    }
    reader.skip(customVersionCount * 20);
  }

  return {
    saveGameVersion,
    packageVersionUe4,
    packageVersionUe5,
    engineMajor,
    engineMinor,
    enginePatch,
    engineBuild,
    engineBranch
  };
};

const readPropertyTag = (reader, header) => {
  const name = reader.readString();
  if (name === 'None') {
    return null;
  }

  const type = reader.readString();
  const size = reader.readUInt32();
  const index = reader.readUInt32();
  const tag = { name, type, size, index };

  if (type === 'ArrayProperty') {
    tag.innerType = reader.readString();
  } else if (type === 'StructProperty') {
    tag.structType = reader.readString();
    reader.skip(16);
  } else if (type === 'SetProperty') {
    tag.keyType = reader.readString();
  } else if (type === 'MapProperty') {
    tag.keyType = reader.readString();
    tag.valueType = reader.readString();
  } else if (type === 'ByteProperty') {
    tag.enumType = reader.readString();
  } else if (type === 'EnumProperty') {
    tag.enumType = reader.readString();
  } else if (type === 'BoolProperty') {
    tag.boolValue = reader.readUInt8() !== 0;
  }

  if (engineHasPropertyGuids(header)) {
    const hasGuid = reader.readUInt8();
    if (hasGuid > 1) {
      throw new Error(`Property ${name} has invalid GUID marker ${hasGuid}.`);
    }
    if (hasGuid === 1) {
      reader.skip(16);
    }
  }

  return tag;
};

const readText = (reader) => {
  reader.readUInt32();
  const historyType = reader.readInt8();
  if (historyType === -1) {
    return reader.readUInt32() === 0 ? null : reader.readString();
  }
  if (historyType === 0) {
    reader.readString();
    reader.readString();
    return reader.readString();
  }
  if (historyType === 11) {
    reader.readString();
    return reader.readString();
  }
  return null;
};

const readProperties = (reader, header, boundary) => {
  const properties = {};
  while (reader.position < boundary) {
    const tag = readPropertyTag(reader, header);
    if (!tag) {
      return properties;
    }

    const dataEnd = reader.position + tag.size;
    if (dataEnd > boundary || dataEnd > reader.data.length) {
      throw new Error(`Property ${tag.name} extends past its containing structure.`);
    }

    properties[tag.name] = readPropertyValue(reader, header, tag, dataEnd);
    if (reader.position > dataEnd) {
      throw new Error(`Property ${tag.name} consumed ${reader.position - dataEnd} bytes past its declared size.`);
    }
    reader.position = dataEnd;
  }
  throw new Error('Metadata structure ended without a None terminator.');
};

const readMapValue = (reader, header, type, boundary, structMode = 'properties') => {
  if (type === 'StrProperty' || type === 'NameProperty' || type === 'EnumProperty') {
    return reader.readString();
  }
  if (type === 'StructProperty') {
    if (structMode === 'guid') {
      return reader.readGuid();
    }
    return readProperties(reader, header, boundary);
  }
  throw new Error(`Unsupported metadata map value type ${type}.`);
};

const readPropertyValue = (reader, header, tag, dataEnd) => {
  switch (tag.type) {
    case 'IntProperty':
      return reader.readInt32();
    case 'FloatProperty':
      return reader.readFloat32();
    case 'StrProperty':
    case 'NameProperty':
    case 'EnumProperty':
      return reader.readString();
    case 'BoolProperty':
      return tag.boolValue;
    case 'TextProperty':
      return readText(reader);
    case 'StructProperty':
      if (tag.structType === 'Guid') {
        return reader.readGuid();
      }
      if (tag.structType === 'Timespan') {
        return reader.readInt64();
      }
      if (tag.structType === 'DateTime') {
        return reader.readUInt64();
      }
      return readProperties(reader, header, dataEnd);
    case 'ArrayProperty': {
      if (tag.innerType !== 'ByteProperty') {
        return null;
      }
      const byteCount = reader.readUInt32();
      const availableBytes = dataEnd - reader.position;
      if (byteCount > availableBytes) {
        throw new Error(
          `Byte array ${tag.name} declares ${byteCount} bytes but only ${availableBytes} remain.`
        );
      }
      if (byteCount > MAX_THUMBNAIL_SIZE) {
        throw new Error(`Byte array ${tag.name} exceeds the ${MAX_THUMBNAIL_SIZE}-byte safety limit.`);
      }
      const bytes = Buffer.from(reader.data.subarray(reader.position, reader.position + byteCount));
      reader.position += byteCount;
      return bytes;
    }
    case 'MapProperty': {
      const removedCount = reader.readUInt32();
      for (let index = 0; index < removedCount; index += 1) {
        readMapValue(reader, header, tag.keyType, dataEnd, 'guid');
      }
      const entryCount = reader.readUInt32();
      if (entryCount > 100000) {
        throw new Error(`Unreasonable metadata map entry count: ${entryCount}.`);
      }
      const entries = [];
      for (let index = 0; index < entryCount; index += 1) {
        try {
          entries.push({
            key: readMapValue(reader, header, tag.keyType, dataEnd, 'guid'),
            value: readMapValue(reader, header, tag.valueType, dataEnd)
          });
        } catch (error) {
          throw new Error(`Failed to read ${tag.name} entry ${index + 1} of ${entryCount}: ${error.message}`, {
            cause: error
          });
        }
      }
      return entries;
    }
    default:
      return null;
  }
};

const ticksToIso = (ticks) => {
  if (typeof ticks !== 'bigint' || ticks < WINDOWS_EPOCH_TICKS) {
    return null;
  }
  const milliseconds = Number((ticks - WINDOWS_EPOCH_TICKS) / TICKS_PER_MILLISECOND);
  const wallClock = new Date(milliseconds);
  if (Number.isNaN(wallClock.getTime())) {
    return null;
  }

  const localDate = new Date(
    wallClock.getUTCFullYear(),
    wallClock.getUTCMonth(),
    wallClock.getUTCDate(),
    wallClock.getUTCHours(),
    wallClock.getUTCMinutes(),
    wallClock.getUTCSeconds(),
    wallClock.getUTCMilliseconds()
  );
  return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
};

const ticksToSeconds = (ticks) => {
  if (typeof ticks !== 'bigint' || ticks < 0n) {
    return null;
  }
  return Number(ticks) / TICKS_PER_SECOND;
};

const normalizeSaveType = (value) => {
  const suffix = typeof value === 'string' ? value.split('::').pop() : '';
  const normalized = suffix.toLowerCase();
  return ['manual', 'auto', 'quick'].includes(normalized) ? normalized : null;
};

const parseSaveMetadata = (data) => {
  const reader = new BinaryReader(data);
  const header = readHeader(reader);
  if (header.engineMajor > 5 || (header.engineMajor === 5 && header.engineMinor >= 4)) {
    throw new Error(`GVAS ${header.engineMajor}.${header.engineMinor} property tags are not supported yet.`);
  }

  const saveGameType = reader.readString();
  if (saveGameType !== SAVE_METADATA_TYPE) {
    throw new Error(`Expected ${SAVE_METADATA_TYPE}, found ${saveGameType}.`);
  }
  const root = readProperties(reader, header, reader.data.length);
  const details = root.AllSavesDetails;
  if (!Array.isArray(details)) {
    throw new Error('The save metadata has no AllSavesDetails map.');
  }

  const saves = details.map(({ key, value }) => {
    const displayName = typeof value.DisplayPlayerName === 'string' ? value.DisplayPlayerName.trim() : '';
    const internalName = typeof value.PlayerName === 'string' ? value.PlayerName.trim() : '';
    const characterName = displayName || (/^UI_/i.test(internalName) ? null : internalName) || null;
    return {
      slotName: typeof value.SlotName === 'string' && value.SlotName ? value.SlotName : key,
      characterId: typeof value.CharacterId === 'string' ? value.CharacterId.toLowerCase() : null,
      characterName,
      level: Number.isInteger(value.PlayerLevel) ? value.PlayerLevel : null,
      saveDateTimeUtc: ticksToIso(value.SaveDate),
      playTimeSeconds: ticksToSeconds(value.PlayTime),
      inGameDate: Number.isFinite(value.InGameDate) ? value.InGameDate : null,
      saveType: normalizeSaveType(value.Type),
      saveNumber: Number.isInteger(value.SaveNumber) ? value.SaveNumber : null,
      thumbnail:
        Buffer.isBuffer(value.SaveThumbnail) &&
        value.SaveThumbnail.length >= 2 &&
        value.SaveThumbnail[0] === 0xff &&
        value.SaveThumbnail[1] === 0xd8
          ? value.SaveThumbnail
          : null
    };
  });

  return { header, saveGameType, saves };
};

module.exports = {
  SAVE_METADATA_TYPE,
  parseSaveMetadata,
  ticksToIso,
  ticksToSeconds
};
