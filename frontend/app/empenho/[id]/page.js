import EmpenhoPage, { generateMetadata } from './index';
export { /* @next-codemod-error `generateMetadata` export is re-exported. Check if this component uses `params` or `searchParams`*/
generateMetadata };
// ISR: dado de empenho muda no maximo 1x/dia (coleta incremental), mas a rota
// e dinamica (milhares de ids) e sem revalidate cada hit vira uma invocacao
// nova sem cache de edge -- crawlers (claudebot/gptbot) bateram 40K vezes em
// 12h nessa rota, 0% cached. 1h de cache corta isso sem afetar frescor real.
export const revalidate = 3600;
export default EmpenhoPage;
