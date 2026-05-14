import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import { fetchEstatisticas } from '../lib/api';
import { formatDate, formatMoney, labelFonte, labelTipo } from '../lib/format';

export default async function EstatisticasPage() {
  const data = await fetchEstatisticas();
  const qualidade = data.qualidade_dados || {};

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Transparencia da cobertura</h1>
          <p>O que ja foi coletado, o que pode ser analisado e quais lacunas ainda limitam conclusoes mais amplas.</p>
        </div>
        <DataAvailabilityBadge status="real" />
      </div>

      <SectionBlock title="Resumo geral">
        <div className="stats-grid">
          <div className="stat-box">
            <span>Documentos coletados</span>
            <strong>{data.total_documentos}</strong>
          </div>
          <div className="stat-box">
            <span>Licitacoes e editais</span>
            <strong>{data.total_licitacoes}</strong>
          </div>
          <div className="stat-box">
            <span>Publicados nos ultimos 30 dias</span>
            <strong>{data.publicacoes_recentes}</strong>
          </div>
          <div className="stat-box">
            <span>Valor estimado em licitacoes</span>
            <strong>{formatMoney(data.valor_estimado_total)}</strong>
          </div>
        </div>
      </SectionBlock>

      <div className="content-grid">
        <SectionBlock title="Documentos por fonte">
          <div className="simple-table">
            {data.por_fonte.map((item) => (
              <div key={item.fonte} className="table-row">
                <span>{item.fonte_nome || labelFonte(item.fonte)}</span>
                <strong>{item.total}</strong>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock title="Documentos por tipo">
          <div className="simple-table">
            {data.por_tipo.map((item) => (
              <div key={item.tipo} className="table-row">
                <span>{item.tipo_nome || labelTipo(item.tipo)}</span>
                <strong>{item.total}</strong>
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>

      <div className="content-grid">
      <SectionBlock title="Dados que precisam de atencao">
          <div className="simple-table">
            <div className="table-row">
              <span>Sem arquivo vinculado</span>
              <strong>{qualidade.sem_pdf || 0}</strong>
            </div>
            <div className="table-row">
              <span>Arquivo com falha de leitura</span>
              <strong>{qualidade.erro_pdf || 0}</strong>
            </div>
            <div className="table-row">
              <span>Sem data de publicacao</span>
              <strong>{qualidade.sem_data || 0}</strong>
            </div>
            <div className="table-row">
              <span>Sem resumo simples</span>
              <strong>{qualidade.sem_resumo || 0}</strong>
            </div>
          </div>
        </SectionBlock>

        <SectionBlock title="Anos com mais registros">
          <div className="simple-table">
            {(data.por_ano || []).slice(0, 8).map((item) => (
              <div key={item.ano} className="table-row">
                <span>{item.ano}</span>
                <strong>{item.total}</strong>
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>

      <SectionBlock title="Ultima situacao por fonte">
        <div className="status-list">
          {data.status_fontes.map((item) => (
            <div key={`${item.fonte}-${item.fim}`} className="status-row">
              <div>
                <strong>{item.fonte_nome || labelFonte(item.fonte)}</strong>
                <p>
                  Ultima execucao em {formatDate(item.fim)}. Novos: {item.itens_novos}. Atualizados:{' '}
                  {item.itens_atualizados}. Com erro: {item.itens_com_erro}.
                </p>
              </div>
              <StatusBadge value={item.status} />
            </div>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock title="Integracoes ainda pendentes">
        <div className="status-list">
          <div className="status-row">
            <div>
              <strong>PNCP</strong>
              <p>Necessario para cruzar contratacoes publicas, arquivos, identificadores nacionais e duplicidades.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
          <div className="status-row">
            <div>
              <strong>Portal de transparencia</strong>
              <p>Necessario para contratos, despesas, receitas, fornecedores, vencedores e valores finais.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
        </div>
      </SectionBlock>
    </main>
  );
}
