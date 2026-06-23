import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';
import { nivelLabel, nivelClasse } from '../../lib/descobertas';

export default function AlertasDestaque({ alertas }) {
  if (!alertas || alertas.length === 0) {
    return null;
  }

  return (
    <div className="content-stack">
      <SectionBlock
        title="Descobertas nos dados"
        description="Curiosidades e padrões que a análise encontrou nos documentos públicos — para explorar, não para alarmar."
        aside={<Link href="/descobertas">Ver todas &rarr;</Link>}
      >
        <div className="citizen-list">
          {alertas.map((alerta) => (
            <Link key={alerta.id} href={`/descobertas/${alerta.id}`} className="citizen-card">
              <div className="citizen-card-head">
                <span className={`badge ${nivelClasse(alerta.severidade)}`}>
                  {nivelLabel(alerta.severidade)}
                </span>
                <span className="muted">{alerta.categoria || 'Geral'}</span>
              </div>
              <h3 className="citizen-card-title">{alerta.titulo}</h3>
              {alerta.narrativa ? (
                <p className="citizen-card-summary">{alerta.narrativa.slice(0, 220)}</p>
              ) : null}
              <div className="citizen-card-meta">
                {alerta.valor_total ? (
                  <span>
                    {formatMoney(alerta.valor_total)}
                    {alerta.valor_periodo_label ? ` (${alerta.valor_periodo_label})` : ''}
                  </span>
                ) : null}
                {alerta.documentos_ids?.length ? (
                  <span>{alerta.documentos_ids.length} documento(s)</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}
