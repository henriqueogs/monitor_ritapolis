export function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

export function buildPathWithQuery(path, params = {}) {
  const search = new URLSearchParams();

  Object.entries(cleanParams(params)).forEach(([key, value]) => {
    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function replaceFilter(path, filters, key, value) {
  return buildPathWithQuery(path, {
    ...filters,
    [key]: value || undefined,
    pagina: undefined,
    limite: undefined
  });
}
