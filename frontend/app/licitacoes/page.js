import Link from 'next/link';
import FilterBar from '../components/FilterBar';
import Pagination from '../components/Pagination';
import QualitySignals from '../components/QualitySignals';
import SearchInput from '../components/SearchInput';
import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchLicitacoes } from '../lib/api';
import { formatDate, formatMoney, labelFonte } from '../lib/format';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

export default async function LicitacoesPage({ searchParams }) {
  const filters = {
    q: currentValue(searchParams, 'q'),
    fonte: currentValue(searchParams, 'fonte'),
    ano: currentValue(searchParams, 'ano'),
    status: currentValue(searchParams, 'status'),
    pagina: currentValue(searchParams, 'pagina') || '1',
    limite: '20'
  };

  const data = await fetchLicitacoes(filters);
  const preservedFilters = {
    q: filters.q,
    fonte: filters.fonte,
    ano: filters.ano,
    status: filters.status
  };

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Licitacoes e compras</h1>
        <p>Veja editais com objeto, modalidade, abertura, valor estimado e fonte oficial.</p>
      </div>

      <FilterBar action="/licitacoes">
        <SearchInput compact defaultValue={filters.q} placeholder="Buscar por numero, modalidade ou objeto" />
        <select name="fonte" defaultValue={filters.fonte} className="field-select">
          <option value="">Todas as fontes</option>
          <option value="site_prefeitura">Prefeitura</option>
          <option value="camara">Camara</option>
        </select>
        <input name="ano" defaultValue={filters.ano} className="field-input" placeholder="Ano" />
        <select name="status" defaultValue={filters.status} className="field-select">
          <option value="">Todos os status</option>
          <option value="aberta">Aberta</option>
          <option value="homologada">Homologada</option>
          <option value="deserta">Deserta</option>
          <option value="ok">Coletado com sucesso</option>
        </select>
      </FilterBar>

      <SectionBlock
        title={`${data.total} licitacoes encontradas`}
        description="Quando algum campo nao aparece, ele ainda nao foi identificado na fonte coletada."
      >
        <div className="licitacao-list">
          {data.dados.length ? (
            data.dados.map((item) => (
              <article key={item.id} className="licitacao-row">
                <div className="licitacao-main">
                  <div className="document-row-meta">
                    <span>{item.fonte_nome || labelFonte(item.fonte)}</span>
                    <span>{item.licitacao_detalhes?.modalidade || 'Edital'}</span>
                    <span>Abertura: {formatDate(item.data_abertura, 'Nao identificada')}</span>
                  </div>
                  <h2>
                    <Link href={`/documento/${item.id}`}>{item.numero || item.titulo}</Link>
                  </h2>
                  <p>{item.dados_extras?.licitacao?.objeto || item.resumo || 'Objeto ainda nao identificado.'}</p>
                  <QualitySignals documento={item} compact />
                </div>
                <div className="licitacao-side">
                  <div className="document-row-field">
                    <span>Valor estimado</span>
                    <strong>{formatMoney(item.valor_estimado)}</strong>
                  </div>
                  <StatusBadge value={item.licitacao_detalhes?.status || item.status_coleta} />
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">Nenhuma licitacao encontrada com esses filtros.</p>
          )}
        </div>
        <Pagination
          basePath="/licitacoes"
          filters={preservedFilters}
          total={data.total}
          pagina={data.pagina}
          limite={data.limite}
        />
      </SectionBlock>
    </main>
  );
}
