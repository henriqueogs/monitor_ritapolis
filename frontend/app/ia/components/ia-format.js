export function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

export function percent(done, total) {
  if (!total) return '0%';
  return `${Math.round((Number(done || 0) / Number(total)) * 100)}%`;
}

export function buildDocsHref(row) {
  const params = new URLSearchParams();
  if (row.ano) params.set('ano', String(row.ano));
  if (row.tipo) params.set('tipo', row.tipo);
  const query = params.toString();
  return query ? `/documentos?${query}` : '/documentos';
}

export function formatDateTime(value) {
  if (!value) return 'Nao informado';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}
