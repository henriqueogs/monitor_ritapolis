import './globals.css';

// Nao forcar dynamic aqui: isso propagava pra TODA rota da arvore e impedia
// paginas com segmento dinamico (empenho/[id], credores/[cnpj]...) de usar
// `revalidate` -- toda pagina virava dynamic sempre, sem cache de edge nenhum
// (bots batendo em cada empenho/credor individual = 71K invocacoes em 12h).
// Paginas SEM searchParams que buscam dado no server (home, /sobre, /temas)
// declaram force-dynamic elas mesmas, senao o build tentaria SSG contra uma
// API que nao existe em CI. As demais ja sao dynamic de forma automatica
// (usam searchParams) ou nao buscam nada (redirects). /admin/* tem seu
// proprio layout com force-dynamic proprio, nao depende deste.
import Link from 'next/link';
import TopNav from './components/TopNav';
import RequestToaster from './components/RequestToaster';
import { DISCLAIMER_RODAPE } from './lib/disclaimer';
import { BRAND, BRAND_TAGLINE, SITE_URL } from './lib/brand';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND} — ${BRAND_TAGLINE}`,
    template: `%s — ${BRAND}`,
  },
  description:
    'Licitações, gastos, empenhos e documentos oficiais de Ritápolis, Minas Gerais — organizados com IA e sempre com link pra fonte oficial.',
  alternates: { canonical: './' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: BRAND,
    title: `${BRAND} — ${BRAND_TAGLINE}`,
    description:
      'Licitações, gastos, empenhos e documentos oficiais de Ritápolis/MG, com fonte em cada dado.',
  },
  twitter: { card: 'summary_large_image' },
};

// Dados estruturados: WebSite + SearchAction (caixa de busca de sitelinks)
const jsonLdWebSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: BRAND,
  alternateName: 'Ritápolis',
  url: SITE_URL,
  description: 'A cidade de Ritápolis/MG em dados abertos.',
  inLanguage: 'pt-BR',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/busca?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebSite) }}
        />
        <TopNav />
        <RequestToaster />
        <div className="app-shell">
          {children}
          <footer className="site-footer">
            <div className="site-footer-inner">
              <div className="footer-brand">
                <strong>{BRAND}</strong>
                <span>{BRAND_TAGLINE}</span>
              </div>
              <div className="footer-meta">
                <span>Dados coletados da fonte oficial da Prefeitura</span>
                <span className="footer-dot">·</span>
                <Link href="/sobre">Sobre o projeto</Link>
              </div>
            </div>
            <p className="site-footer-disclaimer">{DISCLAIMER_RODAPE}</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
