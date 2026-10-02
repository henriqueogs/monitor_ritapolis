const { fetchSitemapDocuments } = require('../frontend/lib/sitemap-documents');

test('honors the API page limit and exposes documents beyond the first page without parallel requests', async () => {
  let active = 0;
  const fetchPage = jest.fn(async ({ pagina, limite }) => {
    expect(++active).toBe(1);
    await Promise.resolve();
    active--;
    return { total: 2338, dados: Array.from({ length: limite }, (_, i) => ({ id: (pagina - 1) * limite + i + 1 })) };
  });
  const result = await fetchSitemapDocuments(fetchPage);
  expect(result.dados).toHaveLength(1500);
  expect(result.dados[1499].id).toBe(1500);
  expect(fetchPage).toHaveBeenCalledTimes(15);
  expect(fetchPage).toHaveBeenLastCalledWith({ pagina: 15, limite: 100 });
});

test('stops on a short last page and deduplicates IDs', async () => {
  const fetchPage = jest.fn()
    .mockResolvedValueOnce({ total: 102, dados: Array.from({ length: 100 }, (_, id) => ({ id })) })
    .mockResolvedValueOnce({ total: 102, dados: [{ id: 99 }, { id: 100 }] });
  const result = await fetchSitemapDocuments(fetchPage);
  expect(result.dados).toHaveLength(101);
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

test('fails regeneration instead of publishing a truncated sitemap after an API error', async () => {
  const fetchPage = jest.fn().mockRejectedValue(new Error('API unavailable'));
  await expect(fetchSitemapDocuments(fetchPage)).rejects.toThrow('API unavailable');
});
