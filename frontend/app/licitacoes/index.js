import Pagination from '../components/Pagination';
import SectionBlock from '../components/SectionBlock';
import { fetchLicitacoes } from '../lib/api';
import LicitacaoFilters from './components/LicitacaoFilters';
import LicitacaoList from './components/LicitacaoList';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

function buildFilters(searchParams) {
  return {
    q: currentValue(searchParams, 'q'),
    fonte: currentValue(searchParams, 'fonte'),
    ano: currentValue(searchParams, 'ano'),
    status: currentValue(searchParams, 'status'),
    pagina: currentValue(searchParams, 'pagina') || '1',
    limite: '20'
  };
}

function preservedFilters(filters) {
  return {
    q: filters.q,
    fonte: filters.fonte,
    ano: filters.ano,
    status: filters.status
  };
}

export default async function LicitacoesPage({ searchParams }) {
  const filters = buildFilters(searchParams);
  const data = await fetchLicitacoes(filters);

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Licitacoes e compras</h1>
        <p>Veja editais com objeto, modalidade, abertura, valor estimado e fonte oficial.</p>
      </div>

      <LicitacaoFilters filters={filters} />

      <SectionBlock
        title={`${data.total} licitacoes encontradas`}
        description="Quando algum campo nao aparece, ele ainda nao foi identificado na fonte coletada."
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
