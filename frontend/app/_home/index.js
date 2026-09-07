import { fetchDocumentos, fetchPainelCidadao, fetchTransparenciaResumo } from '../lib/api';
import { TIPOS_LEGISLACAO } from '../lib/areas';
import HomeHero from './components/HomeHero';
import HomeHubs from './components/HomeHubs';
import HomeQuickLinks from './components/HomeQuickLinks';
import LimitsAndSources from './components/LimitsAndSources';
import PrefeituraAutoSync from './components/PrefeituraAutoSync';

// `total` ja vem escopado ao mandato pelo WHERE do repositorio (diferente de
// `porAno`, que sempre traz o historico inteiro pro grafico da pagina de
// transparencia) -- mesmo campo/rotulo que MetricasPeriodo usa em /transparencia,
// nunca soma sem intervalo (regra de apresentacao do CLAUDE.md). Credores (nao
// licitacoes) como segundo numero pra nao repetir o que o hero ja mostra.
function buildDinheiroStats(resumoTransparencia) {
  const valorEmpenhado = resumoTransparencia?.total?.valor_total || 0;
  const totalCredores = resumoTransparencia?.total?.n_credores || 0;
  const periodoLabel = resumoTransparencia?.periodo?.mandato?.label || 'no mandato atual';

  return { valorEmpenhado, totalCredores, periodoLabel };
}

// Home fica so' com porta de entrada (hero) + selecao de area (hubs) +
// acesso direto -- "analise em destaque" e "Na Lupa" agora moram dentro de
// cada area (/transparencia, /legislacao), ja escopados por tipo de
// documento, em vez de uma versao generica misturando as duas aqui.
export default async function HomePage() {
  const anoAtual = new Date().getFullYear();
  const [painel, atosOficiais, leisOrdinarias, resumoTransparencia] = await Promise.all([
    fetchPainelCidadao(),
    fetchDocumentos({ tipo: TIPOS_LEGISLACAO.join(','), limite: 1 }).catch(() => ({ total: 0 })),
    fetchDocumentos({ tipo: 'lei_ordinaria', limite: 1 }).catch(() => ({ total: 0 })),
    // Backend normaliza qualquer ano do mandato pro inicio dele.
    fetchTransparenciaResumo({ mandato: anoAtual }).catch(() => null),
  ]);

  return (
    <main className="page-container page-observatory">
      <PrefeituraAutoSync />
      <HomeHero />
      <HomeHubs
        dinheiro={buildDinheiroStats(resumoTransparencia)}
        atos={{ totalAtos: atosOficiais.total || 0, totalLeis: leisOrdinarias.total || 0 }}
      />
      <HomeQuickLinks />
      <LimitsAndSources fontes={painel.fontes || []} />
    </main>
  );
}
