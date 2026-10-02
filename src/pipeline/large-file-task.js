'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const { hash } = require('./policy');
const { downloadBoundedPdf, MAX_DISK_PDF_BYTES } = require('../http/bounded-file');
const { extractLargePdfFile } = require('../parsers/large-pdf');
async function fileDigest(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) {digest.update(chunk);}
  return digest.digest('hex');
}
function ownedPaths(namespace) {
  if (!namespace) {throw new Error('PDF: tarefa grande requer namespace de progresso');}
  const root = path.join(path.dirname(config.dbPath), 'pipeline-work');
  const dir = path.join(root, hash(namespace));
  return { root, dir, file: path.join(dir, 'official.pdf') };
}
async function extractLarge(target, url, progress, { downloader, anexo = false } = {}) {
  if (!progress) {throw new Error('PDF: extracao grande requer fila com progresso');}
  const paths = ownedPaths(progress.namespace);
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  const signature = hash([target.id, url, target.hash_conteudo, anexo]);
  const key = `disk-file:${signature}`;
  let saved = progress.load(key);
  if (
    saved &&
    (Date.now() - Date.parse(saved.fetchedAt) > 30 * 86400000 ||
      saved.bytes > MAX_DISK_PDF_BYTES ||
      !fs.existsSync(paths.file) ||
      (await fileDigest(paths.file)) !== saved.hash)
  )
    {saved = null;}
  if (!saved) {
    // Only fixed files inside this namespace's owned directory, never a path
    // supplied by the source or read from a checkpoint.
    for (const file of [paths.file, paths.file + '.part'])
      {if (fs.existsSync(file)) {fs.unlinkSync(file);}}
    saved = await downloadBoundedPdf(downloader, url, paths.file, { progress });
    progress.save(key, saved);
  }
  const ocr = require('../parsers/ocr');
  try {
    const extraction = await extractLargePdfFile(paths.file, {
      fileHash: saved.hash,
      progress,
      ocrPage: ocr.ocrPdfFilePage,
    });
    return {
      extraction,
      fileHash: saved.hash,
      downloadBytes: saved.bytes,
      cleanup: () => {
        // These are disposable working bytes, not a database or backup object.
        for (const file of [paths.file, paths.file + '.part'])
          {if (fs.existsSync(file)) {fs.unlinkSync(file);}}
        if (fs.readdirSync(paths.dir).length === 0) {fs.rmdirSync(paths.dir);}
      },
    };
  } finally {
    await ocr.encerrarWorker();
  }
}
module.exports = { extractLarge, ownedPaths, fileDigest };
