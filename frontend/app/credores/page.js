import CredoresPage, { metadata } from './index';
export { metadata };
// Busca dado no server -- sem isso o build tenta SSG contra a API (que nao
// existe em CI) e congela a pagina vazia ate o proximo deploy.
export const dynamic = 'force-dynamic';
export default CredoresPage;
