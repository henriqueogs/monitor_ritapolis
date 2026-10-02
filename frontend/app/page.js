import { buildPageMetadata } from '../lib/page-metadata';
import { BRAND, SITE_URL } from './lib/brand';

export const metadata = buildPageMetadata('/', { siteUrl: SITE_URL, brand: BRAND });

import HomePage from './index';

// Busca dado no server sem searchParams -- sem isso o build tenta SSG contra
// a API (que nao existe em CI) e congela a home vazia ate o proximo deploy.
export const dynamic = 'force-dynamic';
export default HomePage;
