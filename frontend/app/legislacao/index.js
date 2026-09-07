import AlertasDestaque from '../components/AlertasDestaque';
import IntelligenceBrief from '../components/IntelligenceBrief';
import DocumentList from '../components/DocumentList';
import Pagination from '../components/Pagination';
import SectionBlock from '../components/SectionBlock';
import { fetchAlertasDestaques, fetchAnalisesResumos, fetchDocumentos } from '../lib/api';
import { TIPOS_LEGISLACAO } from '../lib/areas';
import LegislacaoFilters from './components/LegislacaoFilters';

export const metadata = {
  title: 'Legislação Municipal',
  description: 'Decretos, leis, portarias e resoluções publicados pela Prefeitura de Ritápolis/MG.',
};

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

function buildFilters(searchParams) {
  const tipo = currentValue(searchParams, 'tipo');
  return {
    q: currentValue(searchParams, 'q'),
    // Sem tipo escolhido, restringe aos tipos de legislacao (nao mistura
    // edital/emenda) -- com tipo escolhido, filtra só por ele.
    tipo: tipo || TIPOS_LEGISLACAO.join(','),
    tipoSelecionado: tipo,
    ano: currentValue(searchParams, 'ano'),
    pagina: currentValue(searchParams, 'pagina') || '1',
    limite: '20',
  };
}

function buildDestaqueIa(item) {
  if (!item) return null;
  return {
    ...item,
    id: item.documento_id,
    resumo: item.objeto || item.resumo_cidadao,
    titulo: item.titulo_curto || item.titulo,
  };
}

export default async function LegislacaoPage({ searchParams }) {
  const filters = buildFilters(searchParams);
  const tiposLegislacao = TIPOS_LEGISLACAO.join(',');
  const [data, analises, alertas, publicacoesRecentes] = await Promise.all([
    fetchDocumentos(filters),
    fetchAnalisesResumos({ tipo: tiposLegislacao, limite: 6 }).catch(() => ({ itens: [] })),
    fetchAlertasDestaques(4, tiposLegislacao).catch(() => []),
    fetchDocumentos({ tipo: tiposLegislacao, limite: 1 }).catch(() => ({ dados: [] })),
  ]);

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Legislação Municipal</h1>
        <p>Decretos, leis, portarias e resoluções publicados pela Prefeitura — cada item aponta pra fonte oficial.</p>
      </div>

      <IntelligenceBrief
        resumoAi={buildDestaqueIa(analises.itens?.[0])}
        publicacao={publicacoesRecentes.dados?.[0] || null}
      />
      <AlertasDestaque
        alertas={alertas}
        title="Na Lupa · Atos oficiais"
        description="Decretos, leis e portarias que valem um segundo olhar, com fonte oficial."
        ctaHref="/na-lupa"
      />

      <LegislacaoFilters filters={{ q: filters.q, tipo: filters.tipoSelecionado, ano: filters.ano }} />

      <SectionBlock
        title={`${data.total} registros encontrados`}
        description="Resultados separados por ano, com link pro PDF oficial em cada item."
      >
        <DocumentList
          documentos={data.dados}
          groupedByYear
          emptyMessage="Nenhum registro encontrado com esses filtros. Tente remover o tipo ou o ano."
        />
        <Pagination
          basePath="/legislacao"
          filters={{ q: filters.q, tipo: filters.tipoSelecionado, ano: filters.ano }}
          total={data.total}
          pagina={data.pagina}
          limite={data.limite}
        />
      </SectionBlock>
    </main>
  );
}
