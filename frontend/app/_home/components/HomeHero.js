import Link from 'next/link';
import { Search } from 'lucide-react';
import styles from '../styles.module.css';

const promptSuggestions = [
  'Quais foram as últimas licitações?',
  'Existe algum contrato de saúde?',
  'Quais empresas mais aparecem?',
  'Decretos recentes de Ritápolis',
  'Obras públicas em andamento',
];

export default function HomeHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} />
          Transparência Municipal com IA Verificável
        </div>

        <h1>Entenda o que acontece<br />em Ritápolis</h1>

        <p>
          Editais, decretos e licitações transformados em linguagem direta —
          sempre com caminho para a fonte oficial.
        </p>

        <div className={`${styles.heroSearch} hero-search`}>
          <Search size={20} className="hero-search-icon" />
          <form action="/acervo" className={styles.searchForm}>
            <input
              name="q"
              className="hero-search-input"
              placeholder="Busque por merenda, obra, transporte, lei, edital…"
            />
          </form>
        </div>

        <div className={`${styles.promptList} prompt-chips`}>
          {promptSuggestions.map((prompt) => (
            <Link
              key={prompt}
              href={`/acervo?q=${encodeURIComponent(prompt)}`}
              className="prompt-chip"
            >
              {prompt}
            </Link>
          ))}
        </div>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <strong>527</strong>
            <span>Documentos</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <strong>25</strong>
            <span>Resumos IA</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <strong>100%</strong>
            <span>Editais 2026</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <strong>R$&nbsp;1,6M</strong>
            <span>Rastreados</span>
          </div>
        </div>
      </div>
    </section>
  );
}
