import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatMoneyCompact } from '../../lib/format';
import styles from '../styles.module.css';

const CATEGORIAS = ['Saúde', 'Alimentação', 'Educação', 'Obras e Infraestrutura', 'Serviços', 'Equipamentos e Materiais'];

export default function HomeHero({ resumo, licitacoesAno }) {
  const anoCorrente = licitacoesAno?.ano || new Date().getFullYear();

  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} />
          Transparência Municipal com IA Verificável
        </div>

        <h1>Entenda o que acontece<br />em Ritápolis</h1>

        <p>
          Editais, decretos e licitações organizados com dados reais —
          sempre com caminho para a fonte oficial.
        </p>

        <form action="/busca" method="get" role="search" className={`${styles.heroSearch} hero-search`}>
          <Search size={20} className="hero-search-icon" />
          <input
            name="q"
            className="hero-search-input"
            placeholder="Buscar documento, empenho, credor…"
            aria-label="Buscar em documentos, empenhos e credores"
            minLength={2}
          />
          <button type="submit" className="hero-search-button">Procurar</button>
        </form>

        <div className={`${styles.promptList} prompt-chips`}>
          {CATEGORIAS.map((cat) => (
            <Link
              key={cat}
              href={`/licitacoes?categoria=${encodeURIComponent(cat)}`}
              className="prompt-chip"
            >
              {cat}
            </Link>
          ))}
        </div>

        <div className={styles.heroStats}>
          <Link href="/acervo" className={styles.heroStat}>
            <strong>{(resumo?.total_documentos || 0).toLocaleString('pt-BR')}</strong>
            <span>Documentos</span>
          </Link>
          <div className={styles.heroStatDivider} />
          <Link href="/licitacoes" className={styles.heroStat}>
            <strong>{(resumo?.total_licitacoes || 0).toLocaleString('pt-BR')}</strong>
            <span>Licitações</span>
          </Link>
          <div className={styles.heroStatDivider} />
          <Link href={`/licitacoes?ano=${resumo?.ano_padrao || anoCorrente}`} className={styles.heroStat}>
            <strong>{formatMoneyCompact(resumo?.valor_estimado_ano)}</strong>
            <span>Estimado em editais de {resumo?.ano_padrao || anoCorrente}</span>
          </Link>
        </div>

        <p className={styles.heroSource}>
          Coletado automaticamente do{' '}
          <a href="https://ritapolis.mg.gov.br" target="_blank" rel="noopener noreferrer">portal da Prefeitura de Ritápolis</a>
          {' '}e do{' '}
          <a href="https://pncp.gov.br" target="_blank" rel="noopener noreferrer">PNCP</a>.
          Valor estimado somado só dos editais do ano.
        </p>
      </div>
    </section>
  );
}
