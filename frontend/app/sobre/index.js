import SectionBlock from '../components/SectionBlock';
import styles from './styles.module.css';

export default function SobrePage() {
  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Sobre o Monitor Ritapolis</h1>
          <p>
            Uma plataforma de inteligencia publica verificavel para acompanhar publicacoes oficiais, leituras de IA
            e evidencias do poder publico local.
          </p>
        </div>
      </div>
      <SectionBlock title="Como a plataforma deve ser lida">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Fonte oficial primeiro</strong>
              <p>Todo resumo ou leitura precisa apontar para documentos, arquivos ou paginas oficiais.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>IA como apoio</strong>
              <p>A IA resume, organiza e ajuda a comparar, mas nao substitui a fonte oficial.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Lacunas visiveis</strong>
              <p>Quando faltar PNCP, transparencia, fornecedor, vencedor ou valor final, a interface deve dizer isso claramente.</p>
            </div>
          </div>
        </div>
      </SectionBlock>
    </main>
  );
}
