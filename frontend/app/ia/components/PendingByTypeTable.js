import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import styles from '../styles.module.css';
import { buildDocsHref, percent } from './ia-format';

export default function PendingByTypeTable({ rows }) {
  return (
    <SectionBlock
      title="Pendencias por ano e tipo"
      description="Use esta tabela para escolher onde concentrar a proxima rodada de resumos."
    >
      {rows.length ? (
        <div className={styles.iaStatusTable}>
          <div className={styles.iaStatusHead}>
            <span>Ano</span>
            <span>Tipo</span>
            <span>Total</span>
            <span>Ok</span>
            <span>Pendentes</span>
            <span>Cobertura</span>
            <span>Acao</span>
          </div>
          {rows.map((row) => (
            <div key={`${row.ano || 'sem-ano'}-${row.tipo}`} className={styles.iaStatusRow}>
              <strong>{row.ano || 'Sem ano'}</strong>
              <span>{row.tipo}</span>
              <span>{row.total_documentos}</span>
              <span>{row.com_resumo_ok}</span>
              <span>{row.sem_resumo_ok}</span>
              <span>{percent(row.com_resumo_ok, row.total_documentos)}</span>
              <Link href={buildDocsHref(row)}>Abrir documentos</Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Nenhum documento com texto encontrado para os filtros atuais.</p>
      )}
    </SectionBlock>
  );
}
