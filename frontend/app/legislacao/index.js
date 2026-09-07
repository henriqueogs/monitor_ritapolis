import DocumentList from '../components/DocumentList';
import Pagination from '../components/Pagination';
import SectionBlock from '../components/SectionBlock';
import { fetchDocumentos } from '../lib/api';
import LegislacaoFilters, { TIPOS_LEGISLACAO } from './components/LegislacaoFilters';

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

export default async function LegislacaoPage({ searchParams }) {
  const filters = buildFilters(searchParams);
  const data = await fetchDocumentos(filters);

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Legislação Municipal</h1>
        <p>Decretos, leis, portarias e resoluções publicados pela Prefeitura — cada item aponta pra fonte oficial.</p>
      </div>

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
