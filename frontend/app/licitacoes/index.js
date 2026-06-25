import Pagination from '../components/Pagination';
import SectionBlock from '../components/SectionBlock';
import { fetchEstatisticas, fetchLicitacaoAnaliseAnual, fetchLicitacoes } from '../lib/api';
import LicitacaoFilters from './components/LicitacaoFilters';
import LicitacaoList from './components/LicitacaoList';
import LicitacaoProductsTable from './components/LicitacaoProductsTable';
import LicitacaoYearNav from './components/LicitacaoYearNav';
import LicitacaoYearSummary from './components/LicitacaoYearSummary';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

function defaultYear(anos, currentYear) {
  return (
    anos.find((item) => Number(item.ano) === currentYear)?.ano ||
    anos[0]?.ano ||
    currentYear
  );
}

function buildFilters(searchParams, selectedYear) {
  return {
    q: currentValue(searchParams, 'q'),
    fonte: currentValue(searchParams, 'fonte'),
    ano: String(selectedYear || ''),
    status: currentValue(searchParams, 'status'),
    categoria: currentValue(searchParams, 'categoria'),
    fornecedor: currentValue(searchParams, 'fornecedor'),
    pagina: currentValue(searchParams, 'pagina') || '1',
    limite: '20'
  };
}

function preservedFilters(filters) {
  return {
    q: filters.q,
    fonte: filters.fonte,
    ano: filters.ano,
    status: filters.status,
    categoria: filters.categoria
  };
}

export default async function LicitacoesPage({ searchParams }) {
  const currentYear = new Date().getFullYear();
  const estatisticas = await fetchEstatisticas();
  const anos = estatisticas.licitacoes_por_ano || [];
  const selectedYear = currentValue(searchParams, 'ano') || defaultYear(anos, currentYear);
  const filters = buildFilters(searchParams, selectedYear);
  const [data, analiseAnual] = await Promise.all([
    fetchLicitacoes(filters),
    fetchLicitacaoAnaliseAnual({ ano: filters.ano })
  ]);
  const activeYear = anos.find((item) => String(item.ano) === String(filters.ano));

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Licitações {filters.ano}{filters.categoria ? ` — ${filters.categoria}` : ''}{filters.fornecedor ? ` — Fornecedor` : ''}</h1>
          <p>
            {filters.fornecedor
              ? `Filtrado por fornecedor: ${filters.fornecedor}.`
              : filters.categoria
                ? `Filtrado por categoria: ${filters.categoria}.`
                : 'O recorte inicial sempre abre no ano corrente, com os registros mais recentes primeiro.'}
          </p>
        </div>
      </div>

      <LicitacaoYearNav anos={anos} filters={filters} currentYear={currentYear} />
      <LicitacaoYearSummary row={activeYear} currentYear={currentYear} />

      <SectionBlock
        title={`O que foi comprado em ${filters.ano}`}
        description="Itens das licitações com preço e fornecedor, quando a fonte oficial informa."
      >
        <LicitacaoProductsTable produtos={analiseAnual.produtos_recentes || []} />
      </SectionBlock>

      <LicitacaoFilters filters={filters} />

      <SectionBlock
        title={`${data.total} licitacoes de ${filters.ano}`}
        description="Cada linha prioriza processo, modalidade, objeto oficial, data, arquivos e fonte."
      >
        <LicitacaoList itens={data.dados} />
        <Pagination
          basePath="/licitacoes"
          filters={preservedFilters(filters)}
          total={data.total}
          pagina={data.pagina}
          limite={data.limite}
        />
      </SectionBlock>
    </main>
  );
}
