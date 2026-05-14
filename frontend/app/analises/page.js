import Link from 'next/link';
import AnimatedChartPanel from '../components/AnimatedChartPanel';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import FilterBar from '../components/FilterBar';
import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchAnalisesResumos } from '../lib/api';
import { formatDate, formatMoney, labelTipo } from '../lib/format';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

function firstValue(item) {
  return item.valores?.[0]?.valor ?? item.valor_estimado ?? null;
}

function firstDate(item) {
  return item.datas_relevantes?.[0]?.data || item.data_abertura || item.data_publicacao || null;
}

export default async function AnalisesPage({ searchParams }) {
  const filters = {
    tipo: currentValue(searchParams, 'tipo'),
    limite: currentValue(searchParams, 'limite') || '50'
  };
  const data = await fetchAnalisesResumos(filters);
  const totais = data.totais || {};
  const chartItems = (data.por_tipo || []).map((row) => ({
    label: row.tipo_nome || labelTipo(row.tipo),
    value: row.total,
    valueLabel: `${row.total}`
  }));

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Analises verificaveis</h1>
          <p>
            Leituras feitas a partir de resumos IA reais ja salvos. Cada item aponta para o documento oficial e deixa
            claro quando a cobertura ainda e limitada.
          </p>
        </div>
        <DataAvailabilityBadge status={totais.documentos_analisados ? 'real' : 'pendente'} />
      </div>

      <FilterBar action="/analises">
        <select name="tipo" defaultValue={filters.tipo} className="field-select">
          <option value="">Todos os tipos</option>
          <option value="edital">Licitacoes/Editais</option>
          <option value="lei">Leis</option>
          <option value="decreto">Decretos</option>
          <option value="portaria">Portarias</option>
          <option value="contrato">Contratos</option>
        </select>
        <select name="limite" defaultValue={filters.limite} className="field-select">
          <option value="25">25 resultados</option>
          <option value="50">50 resultados</option>
          <option value="100">100 resultados</option>
        </select>
      </FilterBar>

      <div className="observatory-grid">
        <AnimatedChartPanel
          title="Leituras disponiveis por tipo"
          description="Distribuicao das analises ja geradas pela IA. Nao inclui demonstracoes."
          items={chartItems}
          footnote="A cobertura completa continua na area administrativa."
        />
        <SectionBlock title="Como ler estas analises">
          <div className="status-list">
            <div className="status-row">
              <div>
                <strong>Conclusoes apoiadas por fonte</strong>
                <p>Cada leitura abre o documento original e mostra os campos que a IA conseguiu sustentar.</p>
              </div>
              <DataAvailabilityBadge status="real" />
            </div>
            <div className="status-row">
              <div>
                <strong>Limites ainda visiveis</strong>
                <p>Comparacoes financeiras amplas dependem de PNCP, contratos e portal de transparencia.</p>
              </div>
              <DataAvailabilityBadge status="pendente" />
            </div>
          </div>
        </SectionBlock>
      </div>

      <SectionBlock
        title="Feed de inteligencia"
        description="Cada analise abaixo diferencia dado extraido, inferencia de IA e campo ausente. Confira a fonte oficial antes de tomar decisoes."
      >
        {data.itens?.length ? (
          <div className="analysis-list">
            {data.itens.map((item) => (
              <article key={item.documento_id} className="analysis-row">
                <div className="analysis-main">
                  <div className="document-row-meta">
                    <span>{item.tipo_nome}</span>
                    <span>{item.fonte_nome}</span>
                    <span>{item.ano || 'Sem ano'}</span>
                    <span>IA real</span>
                  </div>
                  <h2>
                    <Link href={`/documento/${item.documento_id}`}>
                      {item.titulo_curto || item.numero || item.titulo}
                    </Link>
                  </h2>
                  <p>{item.objeto || item.resumo_cidadao || 'Resumo direto ainda nao disponivel.'}</p>
                  {item.pontos_principais?.length ? (
                    <ul className="plain-list">
                      {item.pontos_principais.slice(0, 3).map((ponto) => (
                        <li key={ponto}>{ponto}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="analysis-validation-line">
                    <DataAvailabilityBadge status="real" />
                    <span>Conclusao baseada no resumo IA salvo e no documento vinculado.</span>
                  </div>
                </div>
                <div className="analysis-side">
                  <div className="document-row-field">
                    <span>Valor</span>
                    <strong>{formatMoney(firstValue(item))}</strong>
                  </div>
                  <div className="document-row-field">
                    <span>Data</span>
                    <strong>{formatDate(firstDate(item), 'Nao identificada')}</strong>
                  </div>
                  <StatusBadge value={item.riscos_ou_alertas?.length ? 'revisar' : 'ok'} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            Nenhum resumo encontrado para estes filtros. Aumente a cobertura na tela de IA.
          </p>
        )}
      </SectionBlock>
    </main>
  );
}
