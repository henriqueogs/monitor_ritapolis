import ProjetosPage, { metadata } from './index';

export { metadata };
// Busca dado no server -- sem isso o build tenta SSG contra a API (que nao
// existe em CI) e congela a pagina vazia ate o proximo deploy. Mesmo padrao
// das outras paginas publicas.
export const dynamic = 'force-dynamic';
export default ProjetosPage;
