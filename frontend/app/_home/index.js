import { Suspense } from 'react';
import HomeHero from './components/HomeHero';
import HomeHubsData from './components/HomeHubsData';
import HomeHubsSkeleton from './components/HomeHubsSkeleton';
import HomeQuickLinks from './components/HomeQuickLinks';
import LimitsAndSourcesData from './components/LimitsAndSourcesData';
import LimitsAndSourcesSkeleton from './components/LimitsAndSourcesSkeleton';
import PrefeituraAutoSync from './components/PrefeituraAutoSync';

// Home fica so' com porta de entrada (hero) + selecao de area (hubs) +
// acesso direto -- "analise em destaque" e "Na Lupa" agora moram dentro de
// cada area (/transparencia, /legislacao), ja escopados por tipo de
// documento, em vez de uma versao generica misturando as duas aqui.
//
// Nao-async de proposito: hero e quick links nao dependem de fetch nenhum e
// devem renderizar na hora. Os dois blocos com dado (hubs, fontes) ficam
// isolados em componentes async proprios + Suspense, pra um nao segurar o
// outro nem a home inteira atras do fetch mais lento.
export default function HomePage() {
  return (
    <main className="page-container page-observatory">
      <PrefeituraAutoSync />
      <HomeHero />
      <Suspense fallback={<HomeHubsSkeleton />}>
        <HomeHubsData />
      </Suspense>
      <HomeQuickLinks />
      <Suspense fallback={<LimitsAndSourcesSkeleton />}>
        <LimitsAndSourcesData />
      </Suspense>
    </main>
  );
}
