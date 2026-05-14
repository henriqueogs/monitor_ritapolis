import Link from 'next/link';
import DocumentList from '../components/DocumentList';
import FilterBar from '../components/FilterBar';
import Pagination from '../components/Pagination';
import SearchInput from '../components/SearchInput';
import SectionBlock from '../components/SectionBlock';
import { fetchDocumentos, fetchEstatisticas } from '../lib/api';
import { replaceFilter } from '../lib/navigation';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

export default async function DocumentosPage({ searchParams }) {
  const filters = {
    q: currentValue(searchParams, 'q'),
    fonte: currentValue(searchParams, 'fonte'),
    tipo: currentValue(searchParams, 'tipo'),
    ano: currentValue(searchParams, 'ano'),
    status: currentValue(searchParams, 'status'),
    qualidade: currentValue(searchParams, 'qualidade'),
    pagina: currentValue(searchParams, 'pagina') || '1',
    limite: '20'
  };

  const [data, estatisticas] = await Promise.all([fetchDocumentos(filters), fetchEstatisticas()]);
  const anos = estatisticas.por_ano || [];
  const preservedFilters = {
    q: filters.q,
    fonte: filters.fonte,
    tipo: filters.tipo,
    ano: filters.ano,
    status: filters.status,
    qualidade: filters.qualidade
  };

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Acervo de documentos</h1>
        <p>Use filtros simples para encontrar publicacoes por assunto, fonte, tipo ou ano.</p>
      </div>

      <FilterBar action="/documentos">
        <SearchInput compact defaultValue={filters.q} />
        <select name="fonte" defaultValue={filters.fonte} className="field-select">
          <option value="">Todas as fontes</option>
          <option value="site_prefeitura">Prefeitura</option>
          <option value="camara">Camara</option>
        </select>
        <select name="tipo" defaultValue={filters.tipo} className="field-select">
          <option value="">Todos os tipos</option>
          <option value="edital">Licitacao/Edital</option>
          <option value="lei">Lei</option>
          <option value="portaria">Portaria</option>
          <option value="contrato">Contrato</option>
          <option value="decreto">Decreto</option>
        </select>
        <input name="ano" defaultValue={filters.ano} className="field-input" placeholder="Ano" />
        <select name="qualidade" defaultValue={filters.qualidade} className="field-select">
          <option value="">Todos os registros</option>
          <option value="sem_pdf">Sem arquivo vinculado</option>
          <option value="erro_pdf">Arquivo com falha</option>
          <option value="sem_data">Sem data identificada</option>
        </select>
      </FilterBar>

      {anos.length ? (
        <nav className="year-filter" aria-label="Filtrar por ano">
          <Link
            href={replaceFilter('/documentos', preservedFilters, 'ano', '')}
            className={!filters.ano ? 'year-filter-link is-active' : 'year-filter-link'}
          >
            Todos
          </Link>
          {anos.slice(0, 12).map((item) => (
            <Link
              key={item.ano}
              href={replaceFilter('/documentos', preservedFilters, 'ano', item.ano)}
              className={String(item.ano) === filters.ano ? 'year-filter-link is-active' : 'year-filter-link'}
            >
              {item.ano}
              <span>{item.total}</span>
            </Link>
          ))}
        </nav>
      ) : null}

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
          basePath="/documentos"
          filters={preservedFilters}
          total={data.total}
          pagina={data.pagina}
          limite={data.limite}
        />
      </SectionBlock>
    </main>
  );
}
