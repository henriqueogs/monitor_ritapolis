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
      parsed.hostname === 'ritapolis.mg.gov.br' &&
      parsed.pathname === '/ws_consulta/Pagina.php' &&
      ['6668', '9656'].includes(parsed.searchParams.get('INT_PAG'))
    );
  } catch {
    return false;
  }
}

export function getOfficialFileUrl(documento) {
  return safeHttpUrl(documento?.url_pdf);
}

export function getSpecificSourcePageUrl(documento) {
  const sourceUrl = safeHttpUrl(documento?.url_origem);
  if (!sourceUrl || isGenericPrefeituraSourcePage(sourceUrl)) return null;
  return sourceUrl;
}

export function getFallbackSourceUrl(documento) {
  return safeHttpUrl(documento?.url_origem);
}
