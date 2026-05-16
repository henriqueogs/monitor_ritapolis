import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import styles from '../styles.module.css';
import { formatDateTime } from './ia-format';

export default function JobsPanel({ jobRows, jobStats, jobErrors }) {
  return (
    <SectionBlock
      title="Fila de resumos"
      description="Ultimos jobs criados para geracao assincrona de resumos, incluindo modo, chunks, duracao e erros."
    >
      {jobStats.length ? (
        <div className={styles.jobStats}>
          {jobStats.map((item) => (
            <span key={item.status}>
              {item.status}: {item.total}
            </span>
          ))}
        </div>
      ) : null}

      {jobErrors.length ? (
        <div className={styles.jobErrorSummary}>
          {jobErrors.map((item) => (
            <div key={`${item.erro_categoria}-${item.erro}`} className={styles.jobErrorRow}>
              <strong>{item.erro_categoria}</strong>
              <span>{item.total} ocorrencia(s)</span>
              <p>{item.erro}</p>
            </div>
          ))}
        </div>
      ) : null}

      {jobRows.length ? (
        <div className="simple-table">
          {jobRows.map((job) => (
            <div key={job.id} className="table-row table-row-stacked">
              <div>
                <strong>
                  <Link href={`/documento/${job.documento_id}`}>#{job.documento_id} - {job.titulo}</Link>
                </strong>
                <p>
                  {job.ano || 'Sem ano'} - {job.tipo} - {job.fonte} -{' '}
                  {job.texto_chars?.toLocaleString('pt-BR') || 0} caracteres
                </p>
                <p>
                  Operacao: {job.operacao?.modo || 'nao informada'}
                  {job.operacao?.chunks_previstos ? ` - ${job.operacao.chunks_previstos} chunks` : ''}
                  {job.duracao_segundos != null ? ` - ${job.duracao_segundos}s` : ''}
                </p>
                {job.erro ? <p className="ai-action-error">{job.erro}</p> : null}
              </div>
              <span>
                {job.status} - tentativas {job.tentativas} - {formatDateTime(job.atualizado_em)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Nenhum job de resumo registrado ainda.</p>
      )}
    </SectionBlock>
  );
}
