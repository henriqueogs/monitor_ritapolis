'use strict';

// Regra pura (CommonJS: o wrangler empacota, o Jest testa sem bundler) de quais arquivos
// oficiais o /preview serve. Precisa aceitar tudo o que frontend/lib/embed-oficial.js
// manda incorporar; senão o iframe abre com "Fonte oficial invalida." (400).

const HOSTS_PREFEITURA = new Set(['ritapolis.mg.gov.br', 'www.ritapolis.mg.gov.br']);
const PATH_ARQUIVO_PREFEITURA = '/obter_arquivo_cadastro_generico.php';
// SGC da Câmara: anexos de leis/projetos em /?Download=N (application/pdf inline).
const HOST_SGC = 'sgc.ritapolis.mg.leg.br';
const DOWNLOAD_NUMERICO = /^[0-9]+$/;

function ehArquivoPrefeitura(target) {
  if (!HOSTS_PREFEITURA.has(target.hostname)) {
    return false;
  }
  const path = target.pathname.toLowerCase();
  return path === PATH_ARQUIVO_PREFEITURA || path.endsWith('.pdf');
}

function ehDownloadSgc(target) {
  if (target.hostname !== HOST_SGC) {
    return false;
  }
  return DOWNLOAD_NUMERICO.test(target.searchParams.get('Download') ?? '');
}

function parsePreviewTarget(rawTarget) {
  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:') {
    return null;
  }
  return ehArquivoPrefeitura(target) || ehDownloadSgc(target) ? target : null;
}

module.exports = { parsePreviewTarget };
