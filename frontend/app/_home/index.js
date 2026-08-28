import IntelligenceBrief from '../components/IntelligenceBrief';
import { fetchAlertasDestaques, fetchAnalisesResumos, fetchPainelCidadao } from '../lib/api';
import AlertasDestaque from './components/AlertasDestaque';
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

export default async function HomePage() {
  const [painel, analises, alertas] = await Promise.all([
    fetchPainelCidadao(),
    fetchAnalisesResumos({ limite: 6 }).catch(() => ({ itens: [], por_tipo: [], totais: {} })),
    fetchAlertasDestaques(4).catch(() => []),
  ]);
  const resumo = painel.resumo || {};
  const analisesItens = analises.itens || [];
  const atualizacoesRecentes = painel.publicacoes_recentes || [];
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
      <UpdatesSection documentos={atualizacoesRecentes} anoPadrao={resumo.ano_padrao} />
      <LimitsAndSources fontes={painel.fontes || []} />
    </main>
  );
}
