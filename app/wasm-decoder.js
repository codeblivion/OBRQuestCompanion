let wasmModule;

const loadWasmModule = () => {
  if (!wasmModule) {
    wasmModule = require('./generated/obr-save-wasm/obr_save_wasm.js');
  }
  return wasmModule;
};

const decompressSaveChunk = (input, expectedSize) => {
  const { decompress_save_chunk: decompress } = loadWasmModule();
  return decompress(input, expectedSize);
};

module.exports = { decompressSaveChunk };
