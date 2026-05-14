const cheerio = require('cheerio');

function absolutize(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function resolveSh3Href(baseUrl, href) {
  if (!href) return null;
  const jsMatch = href.match(/ObterContenedor\("([^"]+)"\)/i);
  if (jsMatch) {
    return absolutize(baseUrl, jsMatch[1]);
  }
  return absolutize(baseUrl, href);
}

function detectPayload(response) {
  const contentType = response.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    return { kind: 'json', data: response.data };
  }

  if (typeof response.data === 'object') {
    return { kind: 'json', data: response.data };
  }

  return { kind: 'html', data: String(response.data || '') };
}

function parseHtmlTable(baseUrl, html) {
  const $ = cheerio.load(html);
  const rows = [];

  $('table tr').each((_, row) => {
    const cells = $(row)
      .find('th, td')
      .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);

    if (!cells.length) return;

    const links = $(row)
      .find('a[href]')
      .map((__, link) => ({
        text: $(link).text().replace(/\s+/g, ' ').trim(),
        href: absolutize(baseUrl, $(link).attr('href'))
      }))
      .get()
      .filter((item) => item.href);

    rows.push({ cells, links });
  });

  return rows;
}

function findModuleLinks(baseUrl, html, keywords) {
  const $ = cheerio.load(html);
  const lowered = keywords.map((item) => item.toLowerCase());

  return $('a[href]')
    .map((_, link) => {
      const text = $(link).text().replace(/\s+/g, ' ').trim();
      const href = $(link).attr('href');
      const fullUrl = resolveSh3Href(baseUrl, href);
      const candidate = `${text} ${href || ''}`.toLowerCase();
      if (!fullUrl) return null;
      if (!lowered.some((word) => candidate.includes(word))) return null;
      return { text, href: fullUrl };
    })
    .get()
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((other) => other.href === item.href) === index);
}

module.exports = {
  detectPayload,
  parseHtmlTable,
  findModuleLinks,
  resolveSh3Href
};
