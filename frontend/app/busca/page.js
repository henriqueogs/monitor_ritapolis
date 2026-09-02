import BuscaPage from './index';

export const metadata = {
  title: 'Busca',
  description: 'Busque documentos oficiais, empenhos e credores de Ritápolis/MG num só lugar.',
};
// Busca dado no server -- sem isso o build tenta SSG contra a API (que nao
// existe em CI) e congela a pagina vazia ate o proximo deploy.
export const dynamic = 'force-dynamic';
export default BuscaPage;
