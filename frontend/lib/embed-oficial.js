'use strict';

// Regra pura (CommonJS, testável sem bundler) de quais arquivos oficiais podem ir em iframe.
// Precisa andar junto de OFFICIAL_SOURCE_FRAME_ORIGINS em csp.js: sem a origem no CSP o navegador
// bloqueia o frame mesmo que esta regra libere.

const { HOSTS_PREFEITURA, HOST_SGC } = require('./ente');

const PATH_ARQUIVO_PREFEITURA = '/obter_arquivo_cadastro_generico.php';
const DOWNLOAD_NUMERICO = /^[0-9]+$/;

function ehArquivoPrefeitura(parsed) {
  if (!HOSTS_PREFEITURA.includes(parsed.hostname)) return false;
  const path = parsed.pathname.toLowerCase();
  return path === PATH_ARQUIVO_PREFEITURA || path.endsWith('.pdf');
}

function ehDownloadSgc(parsed) {
  if (parsed.hostname !== HOST_SGC) return false;
  return DOWNLOAD_NUMERICO.test(parsed.searchParams.get('Download') ?? '');
}

function ehArquivoIncorporavel(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ehArquivoPrefeitura(parsed) || ehDownloadSgc(parsed);
  } catch {
    return false;
  }
}

module.exports = { ehArquivoIncorporavel };
