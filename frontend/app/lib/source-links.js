export function safeHttpUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isGenericPrefeituraSourcePage(value) {
  const url = safeHttpUrl(value);
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return (
      ['ritapolis.mg.gov.br', 'www.ritapolis.mg.gov.br'].includes(parsed.hostname) &&
      parsed.pathname === '/ws_consulta/Pagina.php' &&
      ['6668', '9656'].includes(parsed.searchParams.get('INT_PAG'))
    );
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
  return safeHttpUrl(documento?.url_pdf);
}

export function getSpecificSourcePageUrl(documento) {
  const sourceUrl = safeHttpUrl(documento?.url_origem);
  if (!sourceUrl || isGenericPrefeituraSourcePage(sourceUrl)) return null;
  return getPublicPrefeituraSourcePageUrl(sourceUrl) || sourceUrl;
}

export function getFallbackSourceUrl(documento) {
  return getPublicPrefeituraSourcePageUrl(documento?.url_origem) || safeHttpUrl(documento?.url_origem);
}
