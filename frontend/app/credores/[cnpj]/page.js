import CredorProfilePage, { generateMetadata } from './index';
export { /* @next-codemod-error `generateMetadata` export is re-exported. Check if this component uses `params` or `searchParams`*/
generateMetadata };
// ISR: perfil de credor muda no maximo 1x/dia (coleta incremental), mas a
// rota e dinamica (milhares de cnpjs) e sem revalidate cada hit vira uma
// invocacao nova sem cache de edge -- crawlers (claudebot/gptbot) bateram
// 30K vezes em 12h nessa rota, 0% cached. 1h de cache corta isso sem afetar
// frescor real.
export const revalidate = 3600;
export default CredorProfilePage;
