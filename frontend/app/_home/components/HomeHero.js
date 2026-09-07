import Link from 'next/link';
import styles from '../styles.module.css';
import HeroSearchForm from './HeroSearchForm';

const CATEGORIAS = ['Saúde', 'Alimentação', 'Educação', 'Obras e Infraestrutura', 'Serviços', 'Equipamentos e Materiais'];

// Sem tira de numeros aqui -- os hubs logo abaixo ja carregam os numeros
// reais e escopados por periodo. Repetir "585 documentos / 553 licitacoes"
// bem em cima dos cards do hub era volume duplicado, nao informacao nova.
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

        <HeroSearchForm />

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

        <p className={styles.heroSource}>
          Coletado automaticamente do{' '}
          <a href="https://ritapolis.mg.gov.br" target="_blank" rel="noopener noreferrer">portal da Prefeitura de Ritápolis</a>
          {' '}e do{' '}
          <a href="https://pncp.gov.br" target="_blank" rel="noopener noreferrer">PNCP</a>.
        </p>
      </div>
    </section>
  );
}
