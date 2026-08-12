export function safeHttpUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

// Páginas de lista da prefeitura — não identificam um documento específico
const PREFEITURA_LIST_PATHS = new Set([
  '/pagina/6668',
  '/pagina/6668/editais',
  '/pagina/9656',
  '/pagina/9656/editais 2',
  '/pagina/9656/editais%202',
  '/ws_consulta/pagina.php',
]);

export function isGenericPrefeituraSourcePage(value) {
  const url = safeHttpUrl(value);
  if (!url) return false;

  try {
    const parsed = new URL(url);
    if (!['ritapolis.mg.gov.br', 'www.ritapolis.mg.gov.br'].includes(parsed.hostname)) return false;

    // Decode antes de comparar para cobrir variações de encoding
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    return PREFEITURA_LIST_PATHS.has(path) || PREFEITURA_LIST_PATHS.has(parsed.pathname.toLowerCase());
  } catch {
    return false;
  }
}

export function getPublicPrefeituraSourcePageUrl(value) {
  const url = safeHttpUrl(value);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (!['ritapolis.mg.gov.br', 'www.ritapolis.mg.gov.br'].includes(parsed.hostname)) return null;

    const normalizedPath = parsed.pathname.toLowerCase();
    if (normalizedPath === '/pagina/6668' || normalizedPath === '/pagina/6668/editais') {
      return 'https://ritapolis.mg.gov.br/pagina/6668/editais';
    }
    if (normalizedPath === '/pagina/9656' || normalizedPath === '/pagina/9656/editais%202') {
      return 'https://ritapolis.mg.gov.br/pagina/9656/Editais%202';
    }
    if (parsed.pathname === '/ws_consulta/Pagina.php') {
      const pageId = parsed.searchParams.get('INT_PAG');
      if (pageId === '6668') return 'https://ritapolis.mg.gov.br/pagina/6668/editais';
      if (pageId === '9656') return 'https://ritapolis.mg.gov.br/pagina/9656/Editais%202';
    }
  } catch {
    return null;
  }

  return null;
}

export function getOfficialFileUrl(documento) {
  const url = safeHttpUrl(documento?.url_pdf);
  if (!url) return null;
  // URL SAPL é página HTML, não arquivo — tratar como source page, não arquivo
  if (url.includes('sapl.ritapolis.mg.leg.br')) return null;
  return url;
}

export function getEmbeddableOfficialFileUrl(documento) {
  const url = getOfficialFileUrl(documento);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const isPrefeituraFile =
      parsed.hostname === 'ritapolis.mg.gov.br' &&
      (path === '/obter_arquivo_cadastro_generico.php' || path.endsWith('.pdf'));
    return isPrefeituraFile ? url : null;
  } catch {
    return null;
  }
}

function isCamaraModuleIndexUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'pt.ritapolis.mg.leg.br') return false;
    // Módulo raiz: path simples sem query params identificadores de documento
    return parsed.search === '' || parsed.searchParams.size === 0;
  } catch {
    return false;
  }
}

function getSaplPageUrl(documento) {
  const saplUrl = safeHttpUrl(documento?.url_pdf);
  if (!saplUrl) return null;
  if (!saplUrl.includes('sapl.ritapolis.mg.leg.br')) return null;
  return saplUrl;
}

export function getSpecificSourcePageUrl(documento) {
  // SAPL tem a página específica do documento
  const saplUrl = getSaplPageUrl(documento);
  if (saplUrl) return saplUrl;

  const sourceUrl = safeHttpUrl(documento?.url_origem);
  if (!sourceUrl || isGenericPrefeituraSourcePage(sourceUrl)) return null;
  // URL de módulo genérico da câmara não identifica documento específico
  if (!documento?.url_pdf && isCamaraModuleIndexUrl(sourceUrl)) return null;
  return getPublicPrefeituraSourcePageUrl(sourceUrl) || sourceUrl;
}

export function getFallbackSourceUrl(documento) {
  const url = safeHttpUrl(documento?.url_origem);
  if (!url) return null;
  if (isGenericPrefeituraSourcePage(url)) return null;
  if (!documento?.url_pdf && isCamaraModuleIndexUrl(url)) return null;
  return getPublicPrefeituraSourcePageUrl(url) || url;
}

// Origem de ÚLTIMO recurso: a página de listagem/módulo de onde o documento foi
// raspado. Menos específica que um arquivo ou página de processo, mas é a
// procedência real — todo documento DEVE ter de onde veio (nunca "indisponível"
// quando há url_origem). Use junto com `isOrigemGenerica` para rotular honestamente.
export function getOrigemGenericaUrl(documento) {
  const url = safeHttpUrl(documento?.url_origem);
  if (!url) return null;
  return getPublicPrefeituraSourcePageUrl(url) || url;
}

export function isOrigemGenerica(documento) {
  const url = safeHttpUrl(documento?.url_origem);
  if (!url) return false;
  return isGenericPrefeituraSourcePage(url) || isCamaraModuleIndexUrl(url);
}
