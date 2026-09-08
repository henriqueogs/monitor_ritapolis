import ServidorDossiePage, { generateMetadata, generateStaticParams } from './index';
export { generateMetadata };
export { generateStaticParams };
// Dado de folha muda no maximo 1x/dia (coleta incremental) -- cache de
// borda por 1h, mesmo padrao/motivo de /empenho/[id].
export const revalidate = 3600;
export default ServidorDossiePage;
