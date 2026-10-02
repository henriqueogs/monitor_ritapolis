import AnalisesPage from './index';
import { buildPageMetadata } from '../../lib/page-metadata';
import { BRAND, SITE_URL } from '../lib/brand';

export const metadata = buildPageMetadata('/analises', { siteUrl: SITE_URL, brand: BRAND });

// Busca dado no server -- sem isso o build tenta SSG contra a API (que nao
// existe em CI) e congela a pagina vazia ate o proximo deploy.
export const dynamic = 'force-dynamic';
export default AnalisesPage;
