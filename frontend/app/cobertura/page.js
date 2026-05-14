import KeyValueList from '../components/KeyValueList';
import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchCoberturaPrefeitura } from '../lib/api';

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

export default async function CoberturaPage({ searchParams }) {
  const limite = searchParams?.limite || '100';
  const cobertura = await fetchCoberturaPrefeitura({ limite });

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Cobertura da Prefeitura</h1>
        <p>Comparacao entre arquivos encontrados no site da Prefeitura e registros presentes no sistema.</p>
      </div>

      <SectionBlock title="Resumo da cobertura">
        <div className="stats-grid">
          <div className="stat-box">
            <span>Encontrados no site</span>
            <strong>{formatNumber(cobertura.total_site)}</strong>
          </div>
          <div className="stat-box">
            <span>Presentes no sistema</span>
            <strong>{formatNumber(cobertura.total_presentes_sistema)}</strong>
          </div>
          <div className="stat-box">
            <span>Ausentes no sistema</span>
            <strong>{formatNumber(cobertura.total_ausentes_sistema)}</strong>
          </div>
          <div className="stat-box">
            <span>Limite consultado</span>
            <strong>{formatNumber(limite)}</strong>
          </div>
        </div>
      </SectionBlock>

      <div className="content-grid">
        <SectionBlock title="Cobertura por ano">
          {cobertura.por_ano?.length ? (
            <div className="simple-table">
              {cobertura.por_ano.map((item) => (
                <div key={item.ano} className="table-row">
                  <strong>{item.ano}</strong>
                  <span>
                    {item.presentes_sistema}/{item.encontrados_site} presentes
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">Nenhum dado por ano retornado.</p>
          )}
        </SectionBlock>

        <SectionBlock title="Como interpretar">
          <KeyValueList
            items={[
              { label: 'Fonte', value: 'Site da Prefeitura' },
              { label: 'Comparacao', value: 'URL do PDF no site contra URL salva no banco' },
              { label: 'Uso', value: 'Identificar arquivos publicados que ainda nao entraram no sistema' },
              { label: 'Cuidado', value: 'A consulta depende do site externo e pode demorar' }
            ]}
          />
        </SectionBlock>
      </div>

      <SectionBlock title="Arquivos ausentes">
        {cobertura.ausentes?.length ? (
          <div className="document-list">
            {cobertura.ausentes.slice(0, 50).map((item) => (
              <article key={`${item.url_pdf}-${item.titulo}`} className="document-row">
                <div className="document-row-main">
                  <div className="document-row-meta">
                    <span>{item.ano || 'Sem ano'}</span>
                    <span>{item.numero || 'Sem numero'}</span>
                  </div>
                  <h3>{item.titulo}</h3>
                  <p>{item.url_pdf || 'Sem arquivo identificado no site.'}</p>
                </div>
                <div className="document-row-side">
                  <StatusBadge value="ausente" />
                  {item.url_pdf ? (
                    <a href={item.url_pdf} target="_blank" rel="noreferrer">
                      Abrir arquivo
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhum arquivo ausente dentro do limite consultado.</p>
        )}
      </SectionBlock>
    </main>
  );
}
