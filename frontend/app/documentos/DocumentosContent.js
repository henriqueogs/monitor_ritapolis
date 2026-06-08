import DocumentList from '../components/DocumentList';
import Pagination from '../components/Pagination';
import SectionBlock from '../components/SectionBlock';
import { fetchDocumentos, fetchEstatisticas } from '../lib/api';
import DocumentFilters from './components/DocumentFilters';
import YearFilter from './components/YearFilter';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

function buildFilters(searchParams) {
  return {
    q: currentValue(searchParams, 'q'),
    fonte: currentValue(searchParams, 'fonte'),
    tipo: currentValue(searchParams, 'tipo'),
    ano: currentValue(searchParams, 'ano'),
    status: currentValue(searchParams, 'status'),
    qualidade: currentValue(searchParams, 'qualidade'),
    pagina: currentValue(searchParams, 'pagina') || '1',
    limite: '20'
  };
}

function preservedFilters(filters) {
  return {
    q: filters.q,
    fonte: filters.fonte,
    tipo: filters.tipo,
    ano: filters.ano,
    status: filters.status,
    qualidade: filters.qualidade
  };
}

export default async function DocumentosContent({ searchParams, basePath = '/acervo' }) {
  const filters = buildFilters(searchParams);
  const [data, estatisticas] = await Promise.all([fetchDocumentos(filters), fetchEstatisticas()]);

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Acervo de documentos</h1>
        <p>Use filtros simples para encontrar publicacoes por assunto, fonte, tipo ou ano.</p>
      </div>

      <DocumentFilters filters={filters} action={basePath} />
      <YearFilter anos={estatisticas.por_ano || []} filters={filters} basePath={basePath} />

      <SectionBlock
        title={`${data.total} documentos encontrados`}
        description="Resultados separados por ano, com fonte oficial sempre disponivel no detalhe."
      >
        <DocumentList
          documentos={data.dados}
          groupedByYear
          emptyMessage="Nenhum documento encontrado com esses filtros. Tente buscar por uma palavra mais geral ou remover algum filtro."
        />
        <Pagination
          basePath={basePath}
          filters={preservedFilters(filters)}
          total={data.total}
          pagina={data.pagina}
          limite={data.limite}
        />
      </SectionBlock>
    </main>
  );
}
