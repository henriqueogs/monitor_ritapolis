import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchEstatisticas, fetchResumoIaStatus } from '../lib/api';
import { formatDate, labelFonte, labelTipo } from '../lib/format';
import FornecedoresRanking from './components/FornecedoresRanking';
import StatsSummary from './components/StatsSummary';
import StatsTable from './components/StatsTable';
import styles from './styles.module.css';

function pct(part, total) {
  if (!total) return '—';
  return `${Math.round((Number(part) / Number(total)) * 100)}%`;
}

export default async function EstatisticasContent() {
  const [data, iaStatus] = await Promise.all([
    fetchEstatisticas(),
    fetchResumoIaStatus().catch(() => null)
  ]);
  const qualidade = data.qualidade_dados || {};
  const licitacoesAno = data.licitacoes_ano_corrente || {};

  const totalDocs = iaStatus?.totais?.total_documentos || 0;
  const comResumo = iaStatus?.totais?.com_resumo_ok || 0;
  const semResumo = iaStatus?.totais?.sem_resumo_ok || 0;
  const comErro = iaStatus?.totais?.com_resumo_erro || 0;

  return (
    <main className="page-container">
      <div className="page-title">
        <h1>Transparência da base</h1>
        <p>Uma leitura simples do que já foi coletado e do que ainda precisa de revisão.</p>
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

      {iaStatus ? (
        <SectionBlock
          title="Cobertura de inteligência artificial"
          description="Quantos documentos já foram processados pela IA e quantos ainda estão pendentes."
        >
          <StatsTable rows={[
            { label: 'Com resumo IA (ok)', value: `${comResumo} de ${totalDocs} (${pct(comResumo, totalDocs)})` },
            { label: 'Pendentes de resumo', value: semResumo },
            { label: 'Com erro de processamento', value: comErro },
            ...(licitacoesAno.total ? [
              { label: `Editais ${licitacoesAno.ano} com resumo IA`, value: `${licitacoesAno.com_resumo_ai || 0} de ${licitacoesAno.total}` },
              { label: `Editais ${licitacoesAno.ano} com leitura integrada`, value: `${licitacoesAno.com_leitura_integrada || 0} de ${licitacoesAno.total}` },
              { label: `Editais ${licitacoesAno.ano} com vencedor identificado`, value: `${licitacoesAno.com_vencedor || 0} de ${licitacoesAno.total}` },
              { label: `Editais ${licitacoesAno.ano} com correspondencia PNCP`, value: `${licitacoesAno.com_pncp || 0} de ${licitacoesAno.total}` }
            ] : [])
          ]} />
        </SectionBlock>
      ) : null}

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

      <SectionBlock
        title="Ranking de fornecedores"
        description="Top 10 por valor total identificado (produtos estruturados + contratos homologados)."
      >
        <FornecedoresRanking />
      </SectionBlock>

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
