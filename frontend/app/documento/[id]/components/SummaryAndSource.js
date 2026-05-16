import SectionBlock from '../../../components/SectionBlock';
import SourceLinks from '../../../components/SourceLinks';
import SourceTrace from '../../../components/SourceTrace';
import ValidationStatus from '../../../components/ValidationStatus';
import { bestResumo } from '../../../lib/format';
import styles from '../styles.module.css';

export default function SummaryAndSource({ documento }) {
  return (
    <div className={styles.proofGrid}>
      <SectionBlock title="Resumo do documento">
        <p className="lead-text">{bestResumo(documento)}</p>
        {documento.qualidade_alertas?.length ? (
            <div className={styles.qualityAlertStack}>
              {documento.qualidade_alertas.map((alerta) => (
                <div key={alerta.tipo} className={styles.qualityAlert}>
                <strong>{alerta.label}</strong>
                <p>{alerta.descricao}</p>
              </div>
            ))}
          </div>
        ) : null}
        <SourceLinks documento={documento} />
      </SectionBlock>
      <SectionBlock title="Validação e fonte">
        <ValidationStatus resumoAi={documento.resumo_ai} documento={documento} />
        <SourceTrace documento={documento} />
      </SectionBlock>
    </div>
  );
}
