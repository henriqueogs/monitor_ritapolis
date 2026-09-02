import { SITE_URL } from '../lib/brand';

// JSON-LD BreadcrumbList -- ajuda o Google a mostrar a trilha nos resultados
// de busca e da pro crawler (Googlebot, GPTBot, ClaudeBot...) contexto de
// onde a pagina fica na hierarquia do site, sem precisar inferir por texto.
// `items` = [{ name, url }], da raiz ate a pagina atual (nao inclui a Home).
export default function BreadcrumbJsonLd({ items }) {
  if (!items?.length) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Início', url: '/' }, ...items].map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
