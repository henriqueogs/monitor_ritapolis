import LegislacaoPage, { metadata } from './index';

export { metadata };
// Busca dado no server sem searchParams-safe generateStaticParams -- sem
// isso o build tenta SSG contra a API (que nao existe em CI) e congela a
// pagina vazia ate o proximo deploy. Mesmo padrao das outras paginas
// publicas (ver PR do cache de bots).
export const dynamic = 'force-dynamic';
export default LegislacaoPage;
