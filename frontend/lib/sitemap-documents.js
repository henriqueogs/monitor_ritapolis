'use strict';

// A API pública limita cada página a 100 registros. Sequencial para não
// disputar a VM com coletas/IA; o sitemap mantém seu cache de uma hora.
async function fetchSitemapDocuments(fetchPage, maxDocuments = 1500) {
  const documents = new Map();
  const pageSize = 100;
  const maxPages = Math.ceil(maxDocuments / pageSize);
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage({ pagina: page, limite: pageSize });
    const rows = response?.dados || [];
    for (const doc of rows) {
      if (doc.id != null && documents.size < maxDocuments) documents.set(doc.id, doc);
    }
    if (rows.length < pageSize || documents.size >= maxDocuments ||
        (Number.isFinite(response?.total) && page * pageSize >= response.total)) break;
  }
  return { dados: [...documents.values()] };
}

module.exports = { fetchSitemapDocuments };
