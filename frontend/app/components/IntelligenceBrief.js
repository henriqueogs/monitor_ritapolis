import Link from 'next/link';
import { Sparkles, FileText } from 'lucide-react';
import DataAvailabilityBadge from './DataAvailabilityBadge';
import { bestResumo, formatDate, formatMoney, labelFonte, labelTipo } from '../lib/format';

export default function IntelligenceBrief({ resumoAi, publicacao, licitacao }) {
  const main = resumoAi || publicacao || licitacao;
  const sourceLabel = main?.fonte_nome || labelFonte(main?.fonte);
  const dateLabel = formatDate(
    main?.data_publicacao || main?.atualizado_em || main?.data_abertura,
    'Data não identificada'
  );

  return (
    <Link href={main?.id ? `/documento/${main.id}` : '/analises'} className="brief-card brief-card-standalone">
      <div className="brief-kicker" style={{ marginBottom: 12 }}>
        <DataAvailabilityBadge status={resumoAi ? 'real' : 'parcial'} />
        {resumoAi ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={13} />
            Análise em destaque
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileText size={13} />
            Publicação recente
          </span>
        )}
      </div>
      <h2 className="brief-card-title">{main?.titulo_curto || main?.titulo || 'Análises ainda em preparação'}</h2>
      <p>{main ? bestResumo(main) : 'Conforme os resumos reais forem gerados, as leituras aparecem aqui.'}</p>
      <div className="brief-card-meta">
        <span>{main?.tipo_nome || labelTipo(main?.tipo)}</span>
        <span>{sourceLabel}</span>
        <span>{dateLabel}</span>
        {licitacao?.valor_estimado ? <span>{formatMoney(licitacao.valor_estimado)}</span> : null}
      </div>
    </Link>
  );
}
