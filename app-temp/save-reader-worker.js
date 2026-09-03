const fs = require('node:fs');
const { parentPort, workerData } = require('node:worker_threads');
const { decodeSave } = require('./save-reader');
const { decompressSaveChunk } = require('./wasm-decoder');

const run = async () => {
  const save = await fs.promises.readFile(workerData.savePath);
  return decodeSave(save, decompressSaveChunk);
};

run()
  .then((result) => parentPort.postMessage({ ok: true, result }))
  .catch((error) => {
    parentPort.postMessage({
      ok: false,
      error: {
        name: error?.name || 'Error',
        message: error?.message || String(error)
      }
    });
  });
