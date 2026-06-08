import IntelligenceBrief from '../components/IntelligenceBrief';
import { fetchAnalisesResumos, fetchPainelCidadao } from '../lib/api';
import { formatMoney, labelTipo } from '../lib/format';
import HomeCharts from './components/HomeCharts';
import HomeHero from './components/HomeHero';
import LimitsAndSources from './components/LimitsAndSources';
import PrefeituraAutoSync from './components/PrefeituraAutoSync';
import UpdatesSection from './components/UpdatesSection';

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

function buildChartItems(painel) {
  const atividadePorAno = (painel.anos || [])
    .slice(0, 8)
    .reverse()
    .map((item) => ({
      label: String(item.ano),
      value: item.total,
      valueLabel: `${item.total} atos`
    }));

  const temasPorTipo = (painel.qualidade_por_tipo || [])
    .slice(0, 6)
    .map((item) => ({
      label: item.tipo_nome || labelTipo(item.tipo),
      value: item.total,
      valueLabel: `${item.total}`
    }));

  const comprasComValor = (painel.licitacoes_recentes || [])
    .filter((item) => Number(item.valor_estimado) > 0)
    .slice(0, 5)
    .map((item) => ({
      label: item.numero || item.titulo?.slice(0, 28) || 'Compra publica',
      value: Number(item.valor_estimado || 0),
      valueLabel: formatMoney(item.valor_estimado)
    }));

  const licitacoesAno = painel.licitacoes_ano_corrente || {};
  const modalidadesAno = (licitacoesAno.modalidades || [])
    .slice(0, 6)
    .map((item) => ({
      label: item.modalidade,
      value: item.total,
      valueLabel: `${item.total}`
    }));

  return {
    atividadePorAno,
    temasPorTipo,
    comprasComValor,
    modalidadesAno,
    licitacoesAno
  };
}

export default async function HomePage() {
  const [painel, analises] = await Promise.all([
    fetchPainelCidadao(),
    fetchAnalisesResumos({ limite: 6 }).catch(() => ({ itens: [], por_tipo: [], totais: {} }))
  ]);
  const resumo = painel.resumo || {};
  const analisesItens = analises.itens || [];
  const atualizacoesRecentes = painel.publicacoes_recentes || [];
  const charts = buildChartItems(painel);
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
      <HomeCharts analisesItens={analisesItens} charts={charts} />
      <UpdatesSection documentos={atualizacoesRecentes} anoPadrao={resumo.ano_padrao} />
      <LimitsAndSources fontes={painel.fontes || []} />
    </main>
  );
}
