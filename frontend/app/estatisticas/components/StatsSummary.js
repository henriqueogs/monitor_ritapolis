import { formatMoney } from '../../lib/format';
import styles from '../styles.module.css';

export default function StatsSummary({ data }) {
  return (
    <div className={styles.statsGrid}>
      <div className={styles.statBox}>
        <span>Documentos coletados</span>
        <strong>{data.total_documentos}</strong>
      </div>
      <div className={styles.statBox}>
        <span>Licitações e editais</span>
        <strong>{data.total_licitacoes}</strong>
      </div>
      <div className={styles.statBox}>
        <span>Publicados nos ultimos 30 dias</span>
        <strong>{data.publicacoes_recentes}</strong>
      </div>
      <div className={styles.statBox}>
        <span>Valor estimado em licitacoes</span>
        <strong>{formatMoney(data.valor_estimado_total)}</strong>
      </div>
    </div>
  );
}
