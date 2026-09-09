import ProjetoDetalhePage, { generateMetadata, generateStaticParams } from './index';
export { generateMetadata };
export { generateStaticParams };
// Dado de projeto muda no maximo 1x/dia (coleta manual por ora) -- cache de
// borda por 1h, mesmo padrao/motivo de /empenho/[id] e servidores/[..].
export const revalidate = 3600;
export default ProjetoDetalhePage;
