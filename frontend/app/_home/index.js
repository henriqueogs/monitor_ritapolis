import IntelligenceBrief from '../components/IntelligenceBrief';
import {
  fetchAlertasDestaques,
  fetchAnalisesResumos,
  fetchDocumentos,
  fetchPainelCidadao,
  fetchTransparenciaResumo,
} from '../lib/api';
import { TIPOS_LEGISLACAO } from '../legislacao/components/LegislacaoFilters';
import AlertasDestaque from './components/AlertasDestaque';
import HomeHero from './components/HomeHero';
import HomeHubs from './components/HomeHubs';
import LimitsAndSources from './components/LimitsAndSources';
import PrefeituraAutoSync from './components/PrefeituraAutoSync';

// "Dinheiro publico" (home) mostra so o que envolve gasto/contratacao direto
// -- decreto/lei/portaria (legislacao) e' outra area (hub "Atos oficiais").
const TIPOS_DINHEIRO_PUBLICO = ['edital', 'contrato', 'emenda_parlamentar', 'publicacao_extrato'].join(',');

function buildDestaqueIa(analisesItens) {
  const first = analisesItens[0];

  if (!first) return null;

  return {
    ...first,
    id: first.documento_id,
    resumo: first.objeto || first.resumo_cidadao,
    titulo: first.titulo_curto || first.titulo
  };
}

// `total` ja vem escopado ao mandato pelo WHERE do repositorio (diferente de
// `porAno`, que sempre traz o historico inteiro pro grafico da pagina de
// transparencia) -- mesmo campo/rotulo que MetricasPeriodo usa em /transparencia,
// nunca soma sem intervalo (regra de apresentacao do CLAUDE.md).
function buildDinheiroStats(resumoTransparencia, totalLicitacoes) {
  const valorEmpenhado = resumoTransparencia?.total?.valor_total || 0;
  const periodoLabel = resumoTransparencia?.periodo?.mandato?.label || 'no mandato atual';

  return { valorEmpenhado, periodoLabel, totalLicitacoes };
}

export default async function HomePage() {
  const anoAtual = new Date().getFullYear();
  const [painel, analises, alertas, dinheiroPublico, atosOficiais, leisOrdinarias, resumoTransparencia] =
    await Promise.all([
      fetchPainelCidadao(),
      fetchAnalisesResumos({ limite: 6 }).catch(() => ({ itens: [], por_tipo: [], totais: {} })),
      fetchAlertasDestaques(4).catch(() => []),
      fetchDocumentos({ tipo: TIPOS_DINHEIRO_PUBLICO, limite: 6 }).catch(() => ({ dados: [] })),
      fetchDocumentos({ tipo: TIPOS_LEGISLACAO.join(','), limite: 1 }).catch(() => ({ total: 0 })),
      fetchDocumentos({ tipo: 'lei_ordinaria', limite: 1 }).catch(() => ({ total: 0 })),
      // Backend normaliza qualquer ano do mandato pro inicio dele.
      fetchTransparenciaResumo({ mandato: anoAtual }).catch(() => null),
    ]);
  const resumo = painel.resumo || {};
  const analisesItens = analises.itens || [];
  const atualizacoesRecentes = dinheiroPublico.dados || [];
  const destaqueIa = buildDestaqueIa(analisesItens);
  const ultimaPublicacao = atualizacoesRecentes[0] || null;
  const licitacaoDestaque =
    painel.licitacoes_recentes?.find((item) => Number(item.valor_estimado) > 0) ||
    painel.licitacoes_recentes?.[0] ||
    null;

  return (
    <main className="page-container page-observatory">
      <PrefeituraAutoSync />
      <HomeHero resumo={resumo} licitacoesAno={painel.licitacoes_ano_corrente} />
      <IntelligenceBrief
        resumoAi={destaqueIa}
        publicacao={ultimaPublicacao}
        licitacao={licitacaoDestaque}
      />
      <AlertasDestaque alertas={alertas} />
      <HomeHubs
        dinheiro={buildDinheiroStats(resumoTransparencia, resumo.total_licitacoes)}
        atos={{ totalAtos: atosOficiais.total || 0, totalLeis: leisOrdinarias.total || 0 }}
      />
      <LimitsAndSources fontes={painel.fontes || []} />
    </main>
  );
}
