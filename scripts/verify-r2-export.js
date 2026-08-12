'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const exportRoot = path.resolve(process.env.R2_EXPORT_DIR || path.join(root, 'data', 'r2-export'));
const manifestRoot = path.resolve(path.join(root, 'data', 'migration-manifests'));

function newestManifest() {
  const files = fs.readdirSync(manifestRoot)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(manifestRoot, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) { throw new Error('Nenhum manifesto de migracao encontrado'); }
  return path.join(manifestRoot, files[0].name);
}

function sha256(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function main() {
  const manifestPath = path.resolve(process.argv[2] || newestManifest());
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let gzipBytes = 0;
  let originalBytes = 0;

  for (const object of manifest.objects) {
    const target = path.resolve(exportRoot, ...object.key.split('/'));
    if (!target.startsWith(`${exportRoot}${path.sep}`)) {
      throw new Error(`Chave fora do diretorio de exportacao: ${object.key}`);
    }
    const compressed = fs.readFileSync(target);
    const body = zlib.gunzipSync(compressed);
    const actualHash = sha256(body);
    if (actualHash !== object.sha256 || body.length !== object.bytes) {
      throw new Error(`Objeto corrompido: ${object.key}`);
    }
    if (compressed.length !== object.gzipBytes) {
      throw new Error(`Tamanho gzip divergente: ${object.key}`);
    }
    gzipBytes += compressed.length;
    originalBytes += body.length;
  }

  process.stdout.write(`${JSON.stringify({
    manifest: manifestPath,
    objects: manifest.objects.length,
    originalBytes,
    gzipBytes,
    status: 'ok',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
