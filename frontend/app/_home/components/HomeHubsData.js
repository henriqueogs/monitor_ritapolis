import { fetchDocumentos, fetchTransparenciaResumo } from '../../lib/api';
import { TIPOS_LEGISLACAO } from '../../lib/areas';
import HomeHubs from './HomeHubs';

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

// Isolado num Suspense proprio (ver _home/index.js) pra nao segurar o resto
// da home atras dos 3 fetches que so este bloco precisa.
export default async function HomeHubsData() {
  const anoAtual = new Date().getFullYear();
  const [atosOficiais, leisOrdinarias, resumoTransparencia] = await Promise.all([
    fetchDocumentos({ tipo: TIPOS_LEGISLACAO.join(','), limite: 1 }).catch(() => ({ total: 0 })),
    fetchDocumentos({ tipo: 'lei_ordinaria', limite: 1 }).catch(() => ({ total: 0 })),
    // Backend normaliza qualquer ano do mandato pro inicio dele.
    fetchTransparenciaResumo({ mandato: anoAtual }).catch(() => null),
  ]);

  return (
    <HomeHubs
      dinheiro={buildDinheiroStats(resumoTransparencia)}
      atos={{ totalAtos: atosOficiais.total || 0, totalLeis: leisOrdinarias.total || 0 }}
    />
  );
}
