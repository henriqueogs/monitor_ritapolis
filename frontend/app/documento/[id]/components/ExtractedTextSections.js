import SectionBlock from '../../../components/SectionBlock';
import styles from '../styles.module.css';

export default function ExtractedTextSections({ documento }) {
  return (
    <div className="admin-only">
      <SectionBlock title="Texto completo">
        <details className="details-block">
          <summary>Ler conteúdo extraído</summary>
          <pre className={styles.documentText}>{documento.texto_completo || 'Sem texto extraído.'}</pre>
        </details>
      </SectionBlock>

      <SectionBlock title="Dados técnicos">
        <details className="details-block">
          <summary>Ver dados extras</summary>
          <pre className={styles.documentText}>{JSON.stringify(documento.dados_extras, null, 2)}</pre>
        </details>
      </SectionBlock>
    </div>
  );
}
