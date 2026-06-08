import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatMoneyCompact } from '../../lib/format';
import styles from '../styles.module.css';

const promptSuggestions = [
  'Quais foram as últimas licitações?',
  'Existe algum contrato de saúde?',
  'Quais empresas mais aparecem?',
  'Decretos recentes de Ritápolis',
  'Obras públicas em andamento',
];

export default function HomeHero({ resumo, licitacoesAno }) {
  const anoCorrente = licitacoesAno?.ano || new Date().getFullYear();
  const comResumoAno = licitacoesAno?.com_resumo_ai || 0;
  const totalAno = licitacoesAno?.total || 0;
  const pctResumo = totalAno > 0 ? Math.round((comResumoAno / totalAno) * 100) : 0;

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
            <strong>{(resumo?.total_documentos || 0).toLocaleString('pt-BR')}</strong>
            <span>Documentos</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <strong>{(resumo?.total_licitacoes || 0).toLocaleString('pt-BR')}</strong>
            <span>Licitações</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <strong>{pctResumo > 0 ? `${pctResumo}%` : `${comResumoAno}`}</strong>
            <span>Com resumo IA em {anoCorrente}</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <strong>{formatMoneyCompact(resumo?.valor_estimado_total)}</strong>
            <span>Valor estimado</span>
          </div>
        </div>
      </div>
    </section>
  );
}
