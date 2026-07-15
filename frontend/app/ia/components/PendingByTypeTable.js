import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import styles from '../styles.module.css';
import { buildDocsHref, percent } from './ia-format';

export default function PendingByTypeTable({ rows }) {
  return (
    <SectionBlock
      title="Pendencias por ano e tipo"
      description="No acervo = documentos publicados. Com texto = elegiveis a resumo (o restante aguarda OCR). A cobertura de IA e sempre sobre os documentos com texto."
    >
      {rows.length ? (
        <div className={styles.iaStatusTable}>
          <div className={styles.iaStatusHead}>
            <span>Ano</span>
            <span>Tipo</span>
            <span>No acervo</span>
            <span>Com texto</span>
            <span>Sem texto</span>
            <span>Resumidos</span>
            <span>Cobertura</span>
            <span>Acao</span>
          </div>
          {rows.map((row) => (
            <div key={`${row.ano || 'sem-ano'}-${row.tipo}`} className={styles.iaStatusRow}>
              <strong data-label="Ano">{row.ano || 'Sem ano'}</strong>
              <span data-label="Tipo">{row.tipo}</span>
              <span data-label="No acervo">{row.total_acervo}</span>
              <span data-label="Com texto">{row.total_documentos}</span>
              <span data-label="Sem texto" className={row.sem_texto ? styles.iaGap : undefined}>
                {row.sem_texto || 0}
              </span>
              <span data-label="Resumidos">{row.com_resumo_ok}</span>
              <span data-label="Cobertura">{percent(row.com_resumo_ok, row.total_documentos)}</span>
              <Link data-label="Acao" href={buildDocsHref(row)}>
                Abrir documentos
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Nenhum documento com texto encontrado para os filtros atuais.</p>
      )}
    </SectionBlock>
  );
}
