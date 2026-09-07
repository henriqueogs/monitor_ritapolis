import Link from 'next/link';
import { Landmark, ScrollText } from 'lucide-react';
import { formatMoneyCompact } from '../../lib/format';
import styles from '../styles.module.css';

// Dois hubs de entrada da home (substituem as antigas UpdatesSection +
// AtosOficiaisSection empilhadas na home) -- "ultimas publicacoes" de cada
// area agora moram nas paginas de destino (/transparencia, /legislacao),
// que ja tem suas proprias listas e sub-navegacao. A home so aponta o caminho,
// com numeros reais (nunca placeholder) e sempre escopados por periodo.
export default function HomeHubs({ dinheiro, atos }) {
  return (
    <div className={styles.hubs}>
      <Link href="/transparencia" className={`${styles.hub} ${styles.hubDinheiro}`}>
        <div>
          <div className={styles.hubIcon}><Landmark size={24} /></div>
          <h2>Dinheiro público</h2>
          <p>Pra onde vai o orçamento — empenhos, licitações, credores e o painel de gastos.</p>
        </div>
        <div>
          <div className={styles.hubStats}>
            <div className={styles.hubStat}>
              <strong>{formatMoneyCompact(dinheiro.valorEmpenhado)}</strong>
              <span>Empenhado {dinheiro.periodoLabel}</span>
            </div>
            <div className={styles.hubStat}>
              <strong>{(dinheiro.totalCredores || 0).toLocaleString('pt-BR')}</strong>
              <span>Credores no período</span>
            </div>
          </div>
          <span className={styles.hubCta}>Explorar dinheiro público →</span>
        </div>
      </Link>

      <Link href="/legislacao" className={`${styles.hub} ${styles.hubAtos}`}>
        <div>
          <div className={styles.hubIcon}><ScrollText size={24} /></div>
          <h2>Atos oficiais</h2>
          <p>O que a prefeitura decreta, legisla e publica — decretos, leis e portarias.</p>
        </div>
        <div>
          <div className={styles.hubStats}>
            <div className={styles.hubStat}>
              <strong>{(atos.totalAtos || 0).toLocaleString('pt-BR')}</strong>
              <span>Atos no mandato atual</span>
            </div>
            <div className={styles.hubStat}>
              <strong>{(atos.totalLeis || 0).toLocaleString('pt-BR')}</strong>
              <span>Leis ordinárias</span>
            </div>
          </div>
          <span className={styles.hubCta}>Explorar atos oficiais →</span>
        </div>
      </Link>
    </div>
  );
}
