const ARCHIVE_V2_TAG = 0x222222229E2A83C1n;
const ARCHIVE_V2_TAG_BYTES = Buffer.from([0xC1, 0x83, 0x2A, 0x9E, 0x22, 0x22, 0x22, 0x22]);
const EXPECTED_CHUNK_SIZE = 128 * 1024;
const MAX_DECOMPRESSED_SAVE_SIZE = 256 * 1024 * 1024;
const LEGACY_MAGIC = Buffer.from('TES4SAVEGAME', 'ascii');

const QUEST_CHANGE_RECORD_TYPE = 59;
const QUEST_FLAGS_CHANGED = 0x00000004;
const QUEST_SCRIPT_CHANGED = 0x08000000;
const QUEST_STAGES_CHANGED = 0x10000000;

const asBuffer = (value) => {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('Expected a Buffer or Uint8Array.');
};

const hex = (value, width) => `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const readSafePositiveInt64 = (data, offset, label) => {
  if (offset < 0 || offset > data.length - 8) {
    throw new RangeError(`${label} extends past the end of the save.`);
  }
  const value = data.readBigInt64LE(offset);
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} is outside the supported range.`);
  }
  return Number(value);
};

const decodeUnrealArchive = (saveBytes, decompressChunk) => {
  const save = asBuffer(saveBytes);
  if (typeof decompressChunk !== 'function') {
    throw new TypeError('A Kraken chunk decompressor is required.');
  }

  const archiveOffset = save.indexOf(ARCHIVE_V2_TAG_BYTES);
  if (archiveOffset < 0) {
    throw new Error('No Unreal version-2 compressed archive was found.');
  }

  const chunks = [];
  let cursor = archiveOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;

  while (cursor <= save.length - 49 && save.readBigUInt64LE(cursor) === ARCHIVE_V2_TAG) {
    const chunkIndex = chunks.length;
    const maxChunkSize = readSafePositiveInt64(save, cursor + 8, `Chunk ${chunkIndex} maximum size`);
    const compressor = save[cursor + 16];
    const compressedSize = readSafePositiveInt64(save, cursor + 17, `Chunk ${chunkIndex} compressed size`);
    const uncompressedSize = readSafePositiveInt64(save, cursor + 25, `Chunk ${chunkIndex} uncompressed size`);
    const repeatedCompressedSize = readSafePositiveInt64(save, cursor + 33, `Chunk ${chunkIndex} repeated compressed size`);
    const repeatedUncompressedSize = readSafePositiveInt64(save, cursor + 41, `Chunk ${chunkIndex} repeated uncompressed size`);
    cursor += 49;

    if (maxChunkSize !== EXPECTED_CHUNK_SIZE) {
      throw new Error(`Chunk ${chunkIndex} has maximum size ${maxChunkSize}; expected ${EXPECTED_CHUNK_SIZE}.`);
    }
    if (compressor !== 2) {
      throw new Error(`Chunk ${chunkIndex} uses compressor ${compressor}; expected Unreal Oodle compressor 2.`);
    }
    if (compressedSize !== repeatedCompressedSize || uncompressedSize !== repeatedUncompressedSize) {
      throw new Error(`Chunk ${chunkIndex} has inconsistent repeated size fields.`);
    }
    if (uncompressedSize > EXPECTED_CHUNK_SIZE) {
      throw new Error(`Chunk ${chunkIndex} expands to ${uncompressedSize} bytes; the limit is ${EXPECTED_CHUNK_SIZE}.`);
    }
    if (compressedSize > save.length - cursor) {
      throw new Error(`Chunk ${chunkIndex} compressed data extends past the end of the save.`);
    }
    if (totalUncompressed + uncompressedSize > MAX_DECOMPRESSED_SAVE_SIZE) {
      throw new Error(`The decompressed save exceeds the ${MAX_DECOMPRESSED_SAVE_SIZE}-byte safety limit.`);
    }

    const compressed = save.subarray(cursor, cursor + compressedSize);
    const decompressed = asBuffer(decompressChunk(compressed, uncompressedSize));
    if (decompressed.length !== uncompressedSize) {
      throw new Error(`Chunk ${chunkIndex} produced ${decompressed.length} bytes; expected ${uncompressedSize}.`);
    }

    chunks.push(Buffer.from(decompressed));
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    cursor += compressedSize;
  }

  if (chunks.length === 0) {
    throw new Error('The archive marker was found, but no compressed chunks were decoded.');
  }

  return {
    archiveOffset,
    archiveEnd: cursor,
    chunkCount: chunks.length,
    totalCompressed,
    data: Buffer.concat(chunks, totalUncompressed)
  };
};

class LegacySaveParser {
  constructor(data) {
    this.data = asBuffer(data);
    this.position = 0;
  }

  parse() {
    if (this.data.length < 16) {
      throw new Error('The decompressed stream is too short.');
    }

    const declaredInnerLength = this.readUInt32At(0);
    if (declaredInnerLength !== this.data.length - 4) {
      throw new Error(`Inner stream length prefix is ${declaredInnerLength}; expected ${this.data.length - 4}.`);
    }

    const legacyOffset = this.data.indexOf(LEGACY_MAGIC);
    if (legacyOffset < 0) {
      throw new Error('The decompressed save does not contain TES4SAVEGAME.');
    }

    this.position = legacyOffset;
    this.requireAscii('TES4SAVEGAME');
    const majorVersion = this.readByte();
    const minorVersion = this.readByte();
    this.skip(16);
    const headerVersion = this.readUInt32();
    const saveHeaderSize = this.readUInt32();
    this.skip(saveHeaderSize);

    const pluginCount = this.readByte();
    const plugins = [];
    for (let index = 0; index < pluginCount; index += 1) {
      plugins.push(this.readBString());
    }

    const formIdsOffset = this.readUInt32();
    const changeRecordCount = this.readUInt32();
    this.skip(32);

    const globalsCount = this.readUInt16();
    const unresolvedGlobals = [];
    for (let index = 0; index < globalsCount; index += 1) {
      unresolvedGlobals.push({
        saveReference: this.readUInt32(),
        value: this.readFloat32()
      });
    }
    this.readUInt16();

    const deathCount = this.readUInt32();
    this.skip(deathCount * 6);
    this.skip(4);
    this.skipSizedUInt16Block();
    this.skipSizedUInt16Block();
    this.skipSizedUInt16Block();
    this.readUInt32();

    const createdRecordCount = this.readUInt32();
    for (let index = 0; index < createdRecordCount; index += 1) {
      this.skip(4);
      const dataSize = this.readUInt32();
      this.skip(12);
      this.skip(dataSize);
    }

    this.skipSizedUInt16Block();
    this.skipSizedUInt16Block();
    this.skipSizedUInt16Block();
    const regionDataSize = this.readUInt16();
    this.readUInt16();
    if (regionDataSize < 2) {
      throw new Error('The region block is shorter than its count field.');
    }
    this.skip(regionDataSize - 2);

    const quests = [];
    for (let index = 0; index < changeRecordCount; index += 1) {
      const formId = this.readUInt32();
      const type = this.readByte();
      const flags = this.readUInt32();
      this.readByte();
      const dataSize = this.readUInt16();
      const dataStart = this.position;
      const dataEnd = dataStart + dataSize;
      this.ensureAvailable(dataSize);

      if (type === QUEST_CHANGE_RECORD_TYPE) {
        try {
          quests.push(this.parseQuest(formId, flags, dataStart, dataEnd, plugins));
        } catch (error) {
          throw new Error(
            `Failed to parse QUST ${hex(formId, 8)} (flags ${hex(flags, 8)}, ${dataSize} bytes): ${error.message}`,
            { cause: error }
          );
        }
      }

      this.position = dataEnd;
    }

    const expectedFormIdsAbsolute = legacyOffset + formIdsOffset;
    const tempEffectsSize = this.readUInt32();
    this.skip(tempEffectsSize);
    if (this.position !== expectedFormIdsAbsolute) {
      throw new Error(
        `Change records and temporary effects ended at 0x${this.position.toString(16).toUpperCase()}; ` +
        `the FormID table is declared at 0x${expectedFormIdsAbsolute.toString(16).toUpperCase()}.`
      );
    }

    const formIdCount = this.readUInt32();
    const formIds = new Uint32Array(formIdCount);
    for (let index = 0; index < formIdCount; index += 1) {
      formIds[index] = this.readUInt32();
    }
    const worldspaceCount = this.readUInt32();
    this.skip(worldspaceCount * 4);

    const globals = unresolvedGlobals.map(({ saveReference, value }) => {
      if (saveReference >= formIds.length) {
        throw new Error(`Global save reference ${hex(saveReference, 8)} is outside the ${formIds.length}-entry FormID table.`);
      }
      const formId = formIds[saveReference];
      const pluginIndex = formId >>> 24;
      return {
        save_reference: hex(saveReference, 8),
        form_id: hex(formId, 8),
        plugin_index: pluginIndex,
        plugin: pluginIndex < plugins.length ? plugins[pluginIndex] : null,
        value
      };
    });

    return {
      legacyOffset,
      legacyUsedEnd: this.position,
      majorVersion,
      minorVersion,
      headerVersion,
      changeRecordCount,
      formIdCount,
      worldspaceCount,
      plugins,
      globals,
      quests
    };
  }

  parseQuest(formId, flags, dataStart, dataEnd, plugins) {
    const pluginIndex = formId >>> 24;
    const plugin = pluginIndex < plugins.length ? plugins[pluginIndex] : null;
    let cursor = dataStart;

    if ((flags & QUEST_FLAGS_CHANGED) !== 0) {
      cursor = this.readQuestByte(cursor, dataEnd).cursor;
    }

    const savedStages = [];
    const doneStages = [];
    if ((flags & QUEST_STAGES_CHANGED) !== 0) {
      let result = this.readQuestByte(cursor, dataEnd);
      const stageCount = result.value;
      cursor = result.cursor;
      for (let stageNumber = 0; stageNumber < stageCount; stageNumber += 1) {
        result = this.readQuestByte(cursor, dataEnd);
        const stageIndex = result.value;
        cursor = result.cursor;
        result = this.readQuestByte(cursor, dataEnd);
        const stageFlags = result.value;
        cursor = result.cursor;
        result = this.readQuestByte(cursor, dataEnd);
        const entryCount = result.value;
        cursor = this.skipQuest(result.cursor, dataEnd, entryCount * 5);
        savedStages.push(stageIndex);
        if ((stageFlags & 0x01) !== 0) {
          doneStages.push(stageIndex);
        }
      }
    }

    const scriptVariables = [];
    let scriptVariableCount = null;
    let scriptReferenceVariableCount = null;
    let scriptVariablesResolved = null;
    let scriptTrailingByte = null;

    if ((flags & QUEST_SCRIPT_CHANGED) !== 0) {
      let result = this.readQuestUInt16(cursor, dataEnd);
      const variableCount = result.value;
      cursor = result.cursor;
      scriptVariableCount = variableCount;

      const variableBytes = dataEnd - cursor - 1;
      const minimumVariableBytes = variableCount * 8;
      const maximumVariableBytes = variableCount * 12;
      if (
        variableBytes < minimumVariableBytes ||
        variableBytes > maximumVariableBytes ||
        (maximumVariableBytes - variableBytes) % 4 !== 0
      ) {
        throw new Error(`Script state declares ${variableCount} variables in an invalid ${variableBytes}-byte payload.`);
      }

      const requiredReferenceCount = (maximumVariableBytes - variableBytes) / 4;
      scriptReferenceVariableCount = requiredReferenceCount;
      scriptVariablesResolved = false;
      let parsedReferenceCount = 0;

      for (let variableNumber = 0; variableNumber < variableCount; variableNumber += 1) {
        result = this.readQuestUInt32(cursor, dataEnd);
        const storedVariableIndex = result.value;
        cursor = result.cursor;
        const isReference = storedVariableIndex >>> 28 === 0x0F;
        const variableIndex = isReference ? storedVariableIndex & 0x0FFFFFFF : storedVariableIndex;

        if (isReference) {
          result = this.readQuestUInt32(cursor, dataEnd);
          cursor = result.cursor;
          scriptVariables.push({
            variable_index: variableIndex,
            type: 'ref',
            value: null,
            save_reference: hex(result.value, 8)
          });
          parsedReferenceCount += 1;
        } else {
          result = this.readQuestDouble(cursor, dataEnd);
          cursor = result.cursor;
          scriptVariables.push({
            variable_index: variableIndex,
            type: 'numeric',
            value: result.value,
            save_reference: null
          });
        }
      }

      if (parsedReferenceCount !== requiredReferenceCount) {
        throw new Error(`Tagged ${parsedReferenceCount} reference variables; the payload size requires ${requiredReferenceCount}.`);
      }

      result = this.readQuestByte(cursor, dataEnd);
      scriptTrailingByte = result.value;
      cursor = result.cursor;
    }

    if (cursor !== dataEnd) {
      throw new Error(`A QUST change record has ${dataEnd - cursor} unparsed bytes after its known fields.`);
    }

    savedStages.sort((left, right) => left - right);
    doneStages.sort((left, right) => left - right);
    return {
      form_id: hex(formId, 8),
      object_id: (formId & 0x00FFFFFF).toString(16).toUpperCase().padStart(6, '0'),
      plugin_index: pluginIndex,
      plugin,
      stage: doneStages.length === 0 ? 0 : doneStages[doneStages.length - 1],
      started: doneStages.length !== 0,
      done_stages: doneStages,
      saved_stages: savedStages,
      script_variables: scriptVariables,
      script_variable_count: scriptVariableCount,
      script_reference_variable_count: scriptReferenceVariableCount,
      script_variables_resolved: scriptVariablesResolved,
      script_trailing_byte: scriptTrailingByte
    };
  }

  readQuestByte(cursor, end) {
    if (cursor >= end) {
      throw new Error('A QUST change record ended before its data was complete.');
    }
    return { value: this.data[cursor], cursor: cursor + 1 };
  }

  readQuestUInt16(cursor, end) {
    if (cursor > end - 2) {
      throw new Error('A QUST change record ended before its script-variable count was complete.');
    }
    return { value: this.data.readUInt16LE(cursor), cursor: cursor + 2 };
  }

  readQuestUInt32(cursor, end) {
    if (cursor > end - 4) {
      throw new Error('A QUST change record ended before its script-variable index was complete.');
    }
    return { value: this.data.readUInt32LE(cursor), cursor: cursor + 4 };
  }

  readQuestDouble(cursor, end) {
    if (cursor > end - 8) {
      throw new Error('A QUST change record ended before its script-variable value was complete.');
    }
    return { value: this.data.readDoubleLE(cursor), cursor: cursor + 8 };
  }

  skipQuest(cursor, end, count) {
    if (!Number.isSafeInteger(count) || count < 0 || cursor > end - count) {
      throw new Error('A QUST change record contains an invalid stage-entry count.');
    }
    return cursor + count;
  }

  skipSizedUInt16Block() {
    this.skip(this.readUInt16());
  }

  readBString() {
    const length = this.readByte();
    this.ensureAvailable(length);
    const value = this.data.toString('latin1', this.position, this.position + length);
    this.position += length;
    return value;
  }

  requireAscii(expected) {
    const bytes = Buffer.from(expected, 'ascii');
    this.ensureAvailable(bytes.length);
    if (!this.data.subarray(this.position, this.position + bytes.length).equals(bytes)) {
      throw new Error(`Expected ${expected} at 0x${this.position.toString(16).toUpperCase()}.`);
    }
    this.position += bytes.length;
  }

  readByte() {
    this.ensureAvailable(1);
    const value = this.data[this.position];
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

  readFloat32() {
    this.ensureAvailable(4);
    const value = this.data.readFloatLE(this.position);
    this.position += 4;
    return value;
  }

  readUInt32At(offset) {
    if (offset < 0 || offset > this.data.length - 4) {
      throw new RangeError('A UInt32 read extends past the end of the decompressed save.');
    }
    return this.data.readUInt32LE(offset);
  }

  skip(count) {
    this.ensureAvailable(count);
    this.position += count;
  }

  ensureAvailable(count) {
    if (!Number.isSafeInteger(count) || count < 0 || this.position > this.data.length - count) {
      throw new RangeError(
        `The embedded legacy save ended at 0x${this.data.length.toString(16).toUpperCase()} ` +
        `while reading at 0x${this.position.toString(16).toUpperCase()}.`
      );
    }
  }
}

const parseLegacySave = (data) => new LegacySaveParser(data).parse();

const decodeSave = (saveBytes, decompressChunk) => {
  const archive = decodeUnrealArchive(saveBytes, decompressChunk);
  const legacy = parseLegacySave(archive.data);
  return {
    generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source_format: 'Oblivion Remastered GVAS -> Oodle Kraken archive -> embedded TES4SAVEGAME',
    legacy_version: `${legacy.majorVersion}.${legacy.minorVersion}`,
    save_header_version: legacy.headerVersion,
    change_record_count: legacy.changeRecordCount,
    quest_count: legacy.quests.length,
    global_count: legacy.globals.length,
    plugins: legacy.plugins,
    globals: legacy.globals,
    quests: legacy.quests,
    archive: {
      offset: archive.archiveOffset,
      end: archive.archiveEnd,
      chunk_count: archive.chunkCount,
      compressed_bytes: archive.totalCompressed,
      decompressed_bytes: archive.data.length
    }
  };
};

module.exports = {
  ARCHIVE_V2_TAG_BYTES,
  EXPECTED_CHUNK_SIZE,
  decodeUnrealArchive,
  parseLegacySave,
  decodeSave
};
