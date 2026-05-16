import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchEstatisticas } from '../lib/api';
import { formatDate, labelFonte, labelTipo } from '../lib/format';
import StatsSummary from './components/StatsSummary';
import StatsTable from './components/StatsTable';
import styles from './styles.module.css';

export default async function EstatisticasPage() {
  const data = await fetchEstatisticas();
  const qualidade = data.qualidade_dados || {};

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Estatisticas da base</h1>
        <p>Uma leitura simples do que ja foi coletado e do que ainda precisa de revisao.</p>
      </div>

      <SectionBlock title="Resumo geral">
        <StatsSummary data={data} />
      </SectionBlock>

      <div className={styles.contentGrid}>
        <SectionBlock title="Documentos por fonte">
          <StatsTable rows={data.por_fonte.map((item) => ({
            key: item.fonte,
            label: item.fonte_nome || labelFonte(item.fonte),
            value: item.total
          }))} />
        </SectionBlock>

        <SectionBlock title="Documentos por tipo">
          <StatsTable rows={data.por_tipo.map((item) => ({
            key: item.tipo,
            label: item.tipo_nome || labelTipo(item.tipo),
            value: item.total
          }))} />
        </SectionBlock>
      </div>

      <div className={styles.contentGrid}>
        <SectionBlock title="Dados que precisam de atencao">
          <StatsTable rows={[
            { label: 'Sem arquivo vinculado', value: qualidade.sem_pdf || 0 },
            { label: 'Arquivo com falha de leitura', value: qualidade.erro_pdf || 0 },
            { label: 'Sem data de publicacao', value: qualidade.sem_data || 0 },
            { label: 'Sem resumo simples', value: qualidade.sem_resumo || 0 }
          ]} />
        </SectionBlock>

        <SectionBlock title="Anos com mais registros">
          <StatsTable rows={(data.por_ano || []).slice(0, 8).map((item) => ({
            key: item.ano,
            label: item.ano,
            value: item.total
          }))} />
        </SectionBlock>
      </div>

      <SectionBlock title="Ultima situacao por fonte">
        <div className={styles.statusList}>
          {data.status_fontes.map((item) => (
            <div key={`${item.fonte}-${item.fim}`} className={styles.statusRow}>
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
    </main>
  );
}
