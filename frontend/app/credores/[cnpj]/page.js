import CredorProfilePage, { generateMetadata } from './index';
export { /* @next-codemod-error `generateMetadata` export is re-exported. Check if this component uses `params` or `searchParams`*/
generateMetadata };
// SEM generateStaticParams/revalidate aqui: essa pagina le `searchParams`
// (filtro/paginacao de empenhos), e Next nao deixa misturar rota estatica
// (generateStaticParams) com leitura de searchParams -- da DYNAMIC_SERVER_USAGE
// e quebra a pagina inteira (500 em producao, achado 3 dias depois de eu ter
// adicionado isso pra resolver bot traffic -- reverti aqui). ISR real só é
// possível pra rotas de segmento dinamico que NAO leem searchParams, como
// /empenho/[id]. Pra essa rota, o cache que sobra e o dos fetches
// individuais (REVALIDATE_PADRAO_S em app/lib/api.js).
export default CredorProfilePage;
