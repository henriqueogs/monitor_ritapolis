'use strict';

// Disco do backup diário (src/storage/daily-snapshot.js). A cópia local do banco e o gzip
// ficam em `snapshots-v1/` com nome `pending-<uuid>.db[.gz]` até a confirmação no R2; um
// processo morto no meio (deploy, restart) deixa a sobra sem limpeza, e cada sobra é uma
// cópia inteira do banco. Em 27/11/2026 o disco da VM foi de 72% a 95% em dois dias e o
// backup passou a falhar, pausando as escritas do pipeline (backup_older_than_24h).

const fs = require('fs');
const path = require('path');

// Mais que qualquer backup real (cópia + gzip levam minutos): pending mais novo pode ser
// um `npm run db:backup:r2` manual em andamento.
const IDADE_MINIMA_PENDENTE_MS = 6 * 3600000;
const PADRAO_PENDENTE = /^pending-[0-9a-f-]{36}\.db(\.gz)?$/;
// Cópia do banco + gzip (no pior caso do tamanho da cópia) + 10% de folga.
const FATOR_ESPACO = 2.1;

function limparPendentesAntigos(localDir, { agora = new Date() } = {}) {
  const resultado = { removidos: 0, bytesLiberados: 0 };
  if (!fs.existsSync(localDir)) { return resultado; }
  for (const nome of fs.readdirSync(localDir)) {
    if (!PADRAO_PENDENTE.test(nome)) { continue; }
    const arquivo = path.join(localDir, nome);
    const info = fs.statSync(arquivo);
    if (agora.getTime() - info.mtimeMs < IDADE_MINIMA_PENDENTE_MS) { continue; }
    fs.unlinkSync(arquivo);
    resultado.removidos++;
    resultado.bytesLiberados += info.size;
  }
  return resultado;
}

function espacoNecessarioBytes(bancoBytes) {
  return Math.ceil(bancoBytes * FATOR_ESPACO);
}

function verificarEspacoParaBackup({ bancoBytes, livreBytes }) {
  const necessario = espacoNecessarioBytes(bancoBytes);
  if (livreBytes >= necessario) { return; }
  const mb = b => Math.round(b / 1048576);
  throw new Error(
    `Sem espaco em disco para o backup: livre ${mb(livreBytes)} MB, necessario ${mb(necessario)} MB`
  );
}

function bytesLivres(dir) {
  const { bavail, bsize } = fs.statfsSync(dir);
  return bavail * bsize;
}

function bytesDoBanco(dbPath) {
  return ['', '-wal'].reduce((total, sufixo) => {
    const arquivo = `${dbPath}${sufixo}`;
    return total + (fs.existsSync(arquivo) ? fs.statSync(arquivo).size : 0);
  }, 0);
}

module.exports = {
  limparPendentesAntigos,
  espacoNecessarioBytes,
  verificarEspacoParaBackup,
  bytesLivres,
  bytesDoBanco,
  IDADE_MINIMA_PENDENTE_MS,
};
