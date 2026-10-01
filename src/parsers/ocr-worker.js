'use strict';

// tesseract.js/core 7 selects relaxed SIMD on Node 22/24, but that build
// aborts with float tessdata_best models (upstream issue #1080). Keep the
// accurate Portuguese model and regular SIMD; scope the workaround to this
// OCR thread, never patch dependencies on disk or other application workers.
const path = require('path');
const originalWorker = require.resolve('tesseract.js/src/worker-script/node/index.js');
const detectPath = require.resolve('wasm-feature-detect', {
  paths: [path.dirname(originalWorker)],
});
const detect = require(detectPath);
require.cache[detectPath].exports = { ...detect, relaxedSimd: async () => false };
require(originalWorker);
