'use strict';

const fs = require('fs');
const path = require('path');
const { bytesToHuman } = require('./lib/monitor-metrics');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const apply = hasFlag('apply');
  const dataDir = path.resolve('data');
  const backupDir = path.join(dataDir, 'backups');

  if (!fs.existsSync(dataDir)) {
    console.log('Diretorio data/ nao existe.');
    return;
  }

  const candidates = fs
    .readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => /^ritapolis-backup-.*\.db$/i.test(entry.name))
    .map((entry) => {
      const source = path.join(dataDir, entry.name);
      const target = path.join(backupDir, entry.name);
      const size = fs.statSync(source).size;
      return { name: entry.name, source, target, size };
    });

  const zeroDb = path.join(dataDir, 'monitor.db');
  const zeroDbExists = fs.existsSync(zeroDb) && fs.statSync(zeroDb).size === 0;
  const totalBytes = candidates.reduce((sum, item) => sum + item.size, 0);

  console.log(`${apply ? 'Aplicando' : 'Dry-run'} organizacao de backups`);
  console.log(`Backups candidatos: ${candidates.length} (${bytesToHuman(totalBytes)})`);
  console.log(`Destino: ${backupDir}`);

  if (!apply) {
    for (const item of candidates) {
      console.log(`moveria ${item.name} -> data/backups/${item.name}`);
    }
    if (zeroDbExists) {
      console.log('removeria data/monitor.db (arquivo SQLite vazio)');
    }
    console.log('\nUse: npm run dados:organizar-backups -- --apply');
    return;
  }

  ensureDir(backupDir);
  for (const item of candidates) {
    if (fs.existsSync(item.target)) {
      const targetSize = fs.statSync(item.target).size;
      if (targetSize !== item.size) {
        throw new Error(`Destino ja existe com tamanho diferente: ${item.target}`);
      }
      fs.unlinkSync(item.source);
      console.log(`origem duplicada removida: ${item.name}`);
      continue;
    }
    fs.renameSync(item.source, item.target);
    console.log(`movido: ${item.name}`);
  }

  if (zeroDbExists) {
    fs.unlinkSync(zeroDb);
    console.log('removido: data/monitor.db (vazio)');
  }

  console.log('Organizacao concluida sem excluir backups validos.');
}

main();
