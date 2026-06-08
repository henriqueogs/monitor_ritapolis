import KeyValueList from '../components/KeyValueList';
import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchCoberturaPrefeitura } from '../lib/api';
import styles from './styles.module.css';

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

export default async function CoberturaContent({ searchParams }) {
  const limite = searchParams?.limite || '100';
  const cobertura = await fetchCoberturaPrefeitura({ limite });
  const coverageLimited = ['parcial', 'indisponivel'].includes(cobertura.status);

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Cobertura da Prefeitura</h1>
        <p>Comparacao entre arquivos encontrados no site da Prefeitura e registros presentes no sistema.</p>
      </div>

      {coverageLimited ? (
        <SectionBlock title={cobertura.status === 'parcial' ? 'Consulta externa parcial' : 'Consulta externa indisponivel'}>
          <div className={styles.notice}>
            <div>
              <strong>
                {cobertura.status === 'parcial'
                  ? 'Uma ou mais areas da Prefeitura nao responderam agora.'
                  : 'O site da Prefeitura nao respondeu agora.'}
              </strong>
              <p>{cobertura.erro || 'A cobertura pode estar incompleta neste momento.'}</p>
            </div>
            {cobertura.fontes_consultadas?.[0]?.url ? (
              <a
                href={cobertura.fontes_consultadas[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-secondary"
              >
                Abrir site
              </a>
            ) : null}
          </div>
        </SectionBlock>
      ) : null}

      <SectionBlock title="Resumo geral">
        <div className={styles.statsGrid}>
          <div className={styles.statBox}><span>Encontrados no site</span><strong>{formatNumber(cobertura.total_site)}</strong></div>
          <div className={styles.statBox}><span>Presentes no sistema</span><strong>{formatNumber(cobertura.total_presentes_sistema)}</strong></div>
          <div className={styles.statBox}><span>Ausentes no sistema</span><strong>{formatNumber(cobertura.total_ausentes_sistema)}</strong></div>
          <div className={styles.statBox}><span>Limite consultado</span><strong>{formatNumber(limite)}</strong></div>
        </div>
      </SectionBlock>

      <SectionBlock title="Areas monitoradas" description="Cada area usa uma URL publica para verificacao e endpoints internos apenas para extrair os registros.">
        {cobertura.areas?.length ? (
          <div className={styles.areaList}>
            {cobertura.areas.map((area) => (
              <div key={area.id} className={styles.areaRow}>
                <div>
                  <div className="document-row-meta">
                    <span>{area.tipo || 'area'}</span>
                    <span>pagina {area.page_id}</span>
                  </div>
                  <strong>{area.titulo}</strong>
                  <p>{area.public_url}</p>
                  {area.erro ? <p className={styles.areaError}>{area.erro}</p> : null}
                </div>
                <div className={styles.areaSide}>
                  <StatusBadge value={area.status} />
                  <span>{formatNumber(area.presentes_sistema)}/{formatNumber(area.encontrados_site)} presentes</span>
                  <span>{formatNumber(area.documentos_conhecidos_area)} ja conhecidos na area</span>
                  {area.public_url ? (
                    <a href={area.public_url} target="_blank" rel="noopener noreferrer" className="button button-secondary">
                      Abrir site
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhuma area mapeada para cobertura.</p>
        )}
      </SectionBlock>

      <div className={styles.contentGrid}>
        <SectionBlock title="Cobertura por ano">
          {cobertura.por_ano?.length ? (
            <div className="simple-table">
              {cobertura.por_ano.map((item) => (
                <div key={item.ano} className="table-row">
                  <strong>{item.ano}</strong>
                  <span>{item.presentes_sistema}/{item.encontrados_site} presentes</span>
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
                  {item.url_pdf ? <a href={item.url_pdf} target="_blank" rel="noreferrer">Abrir arquivo</a> : null}
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
