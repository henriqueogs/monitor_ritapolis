import { Landmark, ScrollText } from 'lucide-react';
import styles from '../styles.module.css';

// Mesma geometria de HomeHubs (icone + titulo + descricao reais, so os
// numeros que dependem de fetch viram skeleton) pra nao piscar layout.
export default function HomeHubsSkeleton() {
  return (
    <div className={styles.hubs} aria-busy="true" aria-label="Carregando">
      <div className={`${styles.hub} ${styles.hubDinheiro}`}>
        <div>
          <div className={styles.hubIcon}><Landmark size={24} /></div>
          <h2>Dinheiro público</h2>
          <p>Pra onde vai o orçamento — empenhos, licitações, credores e o painel de gastos.</p>
        </div>
        <div>
          <div className={styles.hubStats}>
            <div className={styles.hubStat}>
              <div className="skeleton skeleton-line" style={{ maxWidth: 90 }} />
            </div>
            <div className={styles.hubStat}>
              <div className="skeleton skeleton-line" style={{ maxWidth: 90 }} />
            </div>
          </div>
          <span className={styles.hubCta}>Explorar dinheiro público →</span>
        </div>
      </div>

      <div className={`${styles.hub} ${styles.hubAtos}`}>
        <div>
          <div className={styles.hubIcon}><ScrollText size={24} /></div>
          <h2>Atos oficiais</h2>
          <p>O que a prefeitura decreta, legisla e publica — decretos, leis e portarias.</p>
        </div>
        <div>
          <div className={styles.hubStats}>
            <div className={styles.hubStat}>
              <div className="skeleton skeleton-line" style={{ maxWidth: 90 }} />
            </div>
            <div className={styles.hubStat}>
              <div className="skeleton skeleton-line" style={{ maxWidth: 90 }} />
            </div>
          </div>
          <span className={styles.hubCta}>Explorar atos oficiais →</span>
        </div>
      </div>
    </div>
  );
}
