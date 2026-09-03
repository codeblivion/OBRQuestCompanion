const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const DEFAULT_TIMEOUT_MS = 120 * 1000;

const readSaveProgressFromFile = async (filePath, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new TypeError('A save path is required.');
  }

  const resolvedPath = path.resolve(filePath.trim());
  const stats = await fs.promises.stat(resolvedPath);
  if (!stats.isFile()) {
    throw new Error('The selected save path is not a file.');
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'save-reader-worker.js'), {
      workerData: { savePath: resolvedPath }
    });
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };

    const timeout = setTimeout(() => {
      worker.terminate();
      finish(reject, new Error(`Save parsing did not finish within ${timeoutMs} ms.`));
    }, timeoutMs);

    worker.once('message', (message) => {
      if (message?.ok) {
        finish(resolve, message.result);
      } else {
        const error = new Error(message?.error?.message || 'The save worker failed.');
        error.name = message?.error?.name || 'Error';
        finish(reject, error);
      }
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (code !== 0) {
        finish(reject, new Error(`The save worker exited with code ${code}.`));
      }
    });
  });
};

module.exports = { readSaveProgressFromFile };
