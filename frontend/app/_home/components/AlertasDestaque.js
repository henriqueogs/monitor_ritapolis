import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';
import { nivelLabel } from '../../lib/descobertas';
import styles from '../../descobertas/styles.module.css';

export default function AlertasDestaque({ alertas }) {
  if (!alertas || alertas.length === 0) {
    return null;
  }

  return (
    <div className="content-stack">
      <SectionBlock
        title="Descobertas nos dados"
        description="Curiosidades e padrões que a análise encontrou nos documentos públicos — para explorar, não para alarmar."
        aside={<Link href="/descobertas">Ver todas &rarr;</Link>}
      >
        <div className={styles.grid}>
          {alertas.map((alerta) => (
            <Link
              key={alerta.id}
              href={`/descobertas/${alerta.id}`}
              className={styles.card}
              data-nivel={alerta.severidade || 'info'}
            >
              <div className={styles.cardTop}>
                <span className={styles.nivel}>
                  <span className={styles.nivelDot} />
                  {nivelLabel(alerta.severidade)}
                </span>
                <span className={styles.tag}>{alerta.categoria || 'Geral'}</span>
              </div>
              <h3 className={styles.cardTitle}>{alerta.titulo}</h3>
              {alerta.narrativa ? <p className={styles.cardSummary}>{alerta.narrativa}</p> : null}
              <div className={styles.cardFooter}>
                {alerta.valor_total ? (
                  <span className={styles.value}>
                    {formatMoney(alerta.valor_total)}
                    {alerta.valor_periodo_label ? (
                      <span className={styles.valuePeriod}> · {alerta.valor_periodo_label}</span>
                    ) : null}
                  </span>
                ) : null}
                {alerta.documentos_ids?.length ? (
                  <span className={styles.footMeta}>
                    {alerta.documentos_ids.length} doc{alerta.documentos_ids.length > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}
