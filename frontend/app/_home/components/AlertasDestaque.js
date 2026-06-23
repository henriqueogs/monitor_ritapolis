import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';

const SEVERIDADE_LABEL = {
  critico: 'Crítico',
  atencao: 'Atenção',
  info: 'Informação',
};

const SEVERIDADE_CLASSE = {
  critico: 'badge-critical',
  atencao: 'badge-warning',
  info: 'badge-info',
};

export default function AlertasDestaque({ alertas }) {
  if (!alertas || alertas.length === 0) {
    return null;
  }

  return (
    <div className="content-stack">
      <SectionBlock
        title="Sinais de atenção"
        description="Padrões detectados pela análise de inteligência a partir dos documentos publicados."
        aside={<Link href="/alertas">Ver todos &rarr;</Link>}
      >
        <div className="citizen-list">
          {alertas.map((alerta) => (
            <Link key={alerta.id} href={`/alertas/${alerta.id}`} className="citizen-card">
              <div className="citizen-card-head">
                <span className={`badge ${SEVERIDADE_CLASSE[alerta.severidade] || 'badge-info'}`}>
                  {SEVERIDADE_LABEL[alerta.severidade] || alerta.severidade}
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
