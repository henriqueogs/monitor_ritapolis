import Link from 'next/link';
import DataAvailabilityBadge from '../../components/DataAvailabilityBadge';
import SectionBlock from '../../components/SectionBlock';

export default function TopicGrid({ temas }) {
  return (
    <SectionBlock
      title="Temas de navegação"
      description="Sem mock: quando a classificação ainda não existe, o tema aparece como pendente ou parcial."
    >
      <div className="topic-grid">
        {temas.map((tema) => (
          <Link
            key={tema.nome}
            href={tema.href || `/acervo?q=${encodeURIComponent(tema.termos.split(',')[0])}`}
            className="topic-card"
          >
            <div className="topic-card-head">
              <h2>{tema.nome}</h2>
              <DataAvailabilityBadge status={tema.status} />
            </div>
            <p>{tema.termos}</p>
          </Link>
        ))}
      </div>
    </SectionBlock>
  );
}
