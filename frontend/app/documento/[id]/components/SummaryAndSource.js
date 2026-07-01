import SectionBlock from '../../../components/SectionBlock';
import SourceLinks from '../../../components/SourceLinks';
import SourceTrace from '../../../components/SourceTrace';
import ValidationStatus from '../../../components/ValidationStatus';
import { bestResumo } from '../../../lib/format';
import styles from '../styles.module.css';

export default function SummaryAndSource({ documento }) {
  // Quando já existe leitura de IA (resumo_ai.dados.resumo_cidadao), a seção
  // "Leitura simples" abaixo (AiSummarySection) já abre com essa mesma frase
  // como título/resumo — mostrar de novo aqui repetiria a mesma síntese em
  // dois blocos. Este bloco só exibe o texto quando ainda não há leitura de
  // IA (bestResumo cai nos fallbacks: objeto da licitação, resumo cru, etc.).
  const temLeituraIa = Boolean(documento.resumo_ai?.dados?.resumo_cidadao);

  return (
    <div className={styles.proofGrid}>
      <SectionBlock title="Resumo do documento">
        {!temLeituraIa ? <p className="lead-text">{bestResumo(documento)}</p> : null}
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
      <SectionBlock title="Origem e limites">
        <ValidationStatus resumoAi={documento.resumo_ai} documento={documento} />
        <SourceTrace documento={documento} />
      </SectionBlock>
    </div>
  );
}
