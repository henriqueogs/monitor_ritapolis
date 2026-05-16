import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import StatusBadge from '../../components/StatusBadge';
import { labelFonte } from '../../lib/format';
import styles from '../styles.module.css';

export default function LimitsAndSources({ fontes }) {
  return (
    <div className={styles.contentGrid}>
      <SectionBlock title="Limites atuais">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Fornecedor, vencedor e valor final</strong>
              <p>Entram quando PNCP e portal de transparencia forem integrados.</p>
            </div>
            <StatusBadge value="revisar" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Temas consolidados</strong>
              <p>Hoje a exploracao usa busca e tipo documental; a classificacao revisavel ainda sera criada.</p>
            </div>
            <StatusBadge value="revisar" />
          </div>
        </div>
      </SectionBlock>

      <SectionBlock title="Fontes oficiais">
        <div className="simple-table">
          {fontes.length ? (
            fontes.map((fonte) => (
              <Link key={fonte.fonte} href={`/documentos?fonte=${fonte.fonte}`} className="table-row">
                <span>{fonte.fonte_nome || labelFonte(fonte.fonte)}</span>
                <strong>ver fonte &rarr;</strong>
              </Link>
            ))
          ) : (
            <p className="empty-state">Nenhuma fonte coletada.</p>
          )}
        </div>
      </SectionBlock>
    </div>
  );
}
