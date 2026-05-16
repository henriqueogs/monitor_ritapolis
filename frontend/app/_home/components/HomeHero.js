import Link from 'next/link';
import { Search } from 'lucide-react';
import styles from '../styles.module.css';

const promptSuggestions = [
  'Quais foram as ultimas licitacoes?',
  'Existe algum contrato relacionado a saude?',
  'Quais empresas mais aparecem?',
  'O que mudou nos decretos recentes?',
  'Existe alguma obra publica em andamento?'
];

export default function HomeHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <h1>Entenda documentos publicos em segundos</h1>
        <p>
          O Monitor Ritapolis usa IA para transformar editais, decretos e licitacoes em informacoes compreensiveis.
        </p>

        <div className={`${styles.heroSearch} hero-search`}>
          <Search size={20} className="hero-search-icon" />
          <form action="/documentos" className={styles.searchForm}>
            <input
              name="q"
              className="hero-search-input"
              placeholder="Pergunte algo sobre documentos publicos..."
            />
          </form>
        </div>

        <div className={`${styles.promptList} prompt-chips`}>
          {promptSuggestions.map((prompt) => (
            <Link
              key={prompt}
              href={`/documentos?q=${encodeURIComponent(prompt)}`}
              className="prompt-chip"
            >
              {prompt}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
