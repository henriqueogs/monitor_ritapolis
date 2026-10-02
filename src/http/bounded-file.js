'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { assertSafeUrl } = require('./safe-network');
const { proxyCollectorRequest } = require('./collector-proxy');
const MAX_DISK_PDF_BYTES = 128 * 1024 * 1024;

// Separate disk-only PDF path. It never changes the general in-memory limit.
async function downloadBoundedPdf(
  downloader,
  url,
  destination,
  { maxBytes = MAX_DISK_PDF_BYTES, progress } = {}
) {
  assertSafeUrl(url);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 5 || maxBytes > MAX_DISK_PDF_BYTES) {
    throw new Error('PDF: limite de disco invalido');
  }
  progress?.checkTime();
  if (progress && progress.remainingMs() < 31000) {
    throw new (require('../pipeline/progress').PipelineYield)();
  }
  await downloader.respeitarDelay(url);
  const budget = Math.min(120000, progress ? progress.remainingMs() - 1000 : 120000);
  const routed = proxyCollectorRequest({
    method: 'get',
    url,
    options: { responseType: 'stream', timeout: budget },
  });
  const partial = `${destination}.part`;
  let descriptor,
    ownsPartial = false;
  let response,
    bytes = 0,
    prefix = Buffer.alloc(0);
  const hash = crypto.createHash('sha256');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    if (fs.existsSync(destination)) {throw new Error('PDF: destino ja existe; nao sobrescrever');}
    descriptor = fs.openSync(partial, 'wx', 0o600);
    ownsPartial = true;
    response = await downloader.http.request({
      method: routed.method,
      url: routed.url,
      ...routed.options,
      // Axios also enforces maxContentLength on streamed responses. Override
      // ONLY this disk request with its explicit finite cap, not defaults.
      maxContentLength: maxBytes,
      signal: controller.signal,
    });
    if (Number(response.headers?.['content-length']) > maxBytes) {
      throw new Error(`PDF: arquivo excede o limite de disco de ${maxBytes} bytes`);
    }
    const meter = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes)
          {return callback(new Error(`PDF: arquivo excede o limite de disco de ${maxBytes} bytes`));}
        if (prefix.length < 1024)
          {prefix = Buffer.concat([prefix, chunk.subarray(0, 1024 - prefix.length)]);}
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    const output = fs.createWriteStream(partial, { fd: descriptor, autoClose: true });
    descriptor = undefined;
    await pipeline(response.data, meter, output, { signal: controller.signal });
    if (!prefix.includes(Buffer.from('%PDF-')))
      {throw new Error('PDF: resposta nao possui assinatura PDF');}
    fs.renameSync(partial, destination);
    return { bytes, hash: hash.digest('hex'), fetchedAt: new Date().toISOString() };
  } catch (error) {
    response?.data?.destroy();
    // Only this operation's exclusive .part file; a preexisting collision is
    // never deleted. The caller supplies an owned, verified workspace path.
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      descriptor = undefined;
    }
    if (ownsPartial && fs.existsSync(partial)) {fs.unlinkSync(partial);}
    if (progress && controller.signal.aborted && progress.remainingMs() <= 1000) {
      throw new (require('../pipeline/progress').PipelineYield)();
    }
    if (controller.signal.aborted) {throw new Error('PDF: timeout no download limitado');}
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { downloadBoundedPdf, MAX_DISK_PDF_BYTES };
