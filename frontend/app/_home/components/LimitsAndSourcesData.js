import { fetchPainelCidadao } from '../../lib/api';
import LimitsAndSources from './LimitsAndSources';

// Isolado num Suspense proprio (ver _home/index.js) pra nao segurar o resto
// da home atras deste fetch.
export default async function LimitsAndSourcesData() {
  const painel = await fetchPainelCidadao();
  return <LimitsAndSources fontes={painel.fontes || []} />;
}
