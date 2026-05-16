import SectionBlock from '../../components/SectionBlock';
import styles from '../styles.module.css';
import { percent } from './ia-format';

export default function CoverageSummary({ total }) {
  return (
    <SectionBlock title="Cobertura atual">
      <div className={styles.statsGrid}>
        <div className={styles.statBox}>
          <span>Documentos com texto</span>
          <strong>{total.total_documentos || 0}</strong>
        </div>
        <div className={styles.statBox}>
          <span>Com resumo valido</span>
          <strong>{total.com_resumo_ok || 0}</strong>
        </div>
        <div className={styles.statBox}>
          <span>Pendentes</span>
          <strong>{total.sem_resumo_ok || 0}</strong>
        </div>
        <div className={styles.statBox}>
          <span>Cobertura</span>
          <strong>{percent(total.com_resumo_ok, total.total_documentos)}</strong>
        </div>
      </div>
    </SectionBlock>
  );
}
