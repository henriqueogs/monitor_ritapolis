import { fetchDocumentos, fetchTransparenciaResumo } from '../../lib/api';
import { TIPOS_LEGISLACAO } from '../../lib/areas';
import { formatMoneyCompact } from '../../lib/format';
import ModulosArea from '../../components/ModulosArea';
import { montarPeriodoLabel } from '../../../lib/periodo-label';

// `total` ja vem escopado ao mandato pelo WHERE do repositorio -- mesmo
// campo/rotulo que MetricasPeriodo usa em /transparencia, nunca soma sem
// intervalo (regra de apresentacao do CLAUDE.md).
function buildDinheiroStats(resumoTransparencia) {
  const total = resumoTransparencia?.total;
  if (!total) return [];
  // Mesmo rótulo de /transparencia: anos com dado (2025–2026), não o mandato inteiro.
  const periodoLabel = montarPeriodoLabel('mandato', resumoTransparencia.periodo, resumoTransparencia.porMandato);
  return [
    { rotulo: `Empenhado ordinário ${periodoLabel}`, valor: formatMoneyCompact(total.valor_total || 0) },
    { rotulo: `Credores ${periodoLabel}`, valor: (total.n_credores || 0).toLocaleString('pt-BR') },
  ];
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
    <>
      <ModulosArea areaId="dinheiro" stats={buildDinheiroStats(resumoTransparencia)} />
      <ModulosArea
        areaId="atos"
        stats={[
          { rotulo: 'Atos no acervo (todos os anos)', valor: (atosOficiais.total || 0).toLocaleString('pt-BR') },
          { rotulo: 'Leis ordinárias (todos os anos)', valor: (leisOrdinarias.total || 0).toLocaleString('pt-BR') },
        ]}
      />
    </>
  );
}
