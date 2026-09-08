import styles from '../styles.module.css';

// So' titulo + descricao aqui -- chips de categoria e "coletado
// automaticamente de..." saiam (redundante com o resto da pagina); os hubs
// logo abaixo ja carregam numeros reais escopados e cada area tem sua
// propria busca (AreaSearchForm em /transparencia e /legislacao).
export default function HomeHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} />
          Transparência Municipal com IA Verificável
        </div>
        <div className={styles.constructionBadge} title="O site ainda está em desenvolvimento ativo — dados, telas e cobertura mudam com frequência.">
          🚧 Em construção
        </div>

        <h1>Entenda o que acontece<br />em Ritápolis</h1>

        <p>
          Editais, decretos, licitações e gastos de Ritápolis, Minas Gerais —
          organizados com dados reais, sempre com caminho para a fonte oficial.
        </p>
      </div>
    </section>
  );
}
