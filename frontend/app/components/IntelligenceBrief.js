import Link from 'next/link';
import { Sparkles, ArrowRight, FileText } from 'lucide-react';
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
    <section className="brief-shell">
      <div className="brief-copy">
        <div className="brief-kicker">
          <DataAvailabilityBadge status={resumoAi ? 'real' : 'parcial'} />
          <span>Leitura pública verificável</span>
        </div>
        <h1>Entenda o que está acontecendo em Ritápolis</h1>
        <p>
          A plataforma organiza atos, licitações e leituras de IA em linguagem direta, sempre com caminho para a
          fonte oficial.
        </p>
        <form action="/acervo" className="brief-search">
          <input name="q" placeholder="Buscar por merenda, obra, transporte, lei, edital…" />
          <button type="submit">Explorar evidências</button>
        </form>
      </div>

      <Link href={main?.id ? `/documento/${main.id}` : '/analises'} className="brief-card">
        <span className="brief-card-label">
          {resumoAi ? (
            <>
              <Sparkles size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              Análise em destaque
            </>
          ) : (
            <>
              <FileText size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              Publicação recente
            </>
          )}
        </span>
        <h2>{main?.titulo_curto || main?.titulo || 'Análises ainda em preparação'}</h2>
        <p>{main ? bestResumo(main) : 'Conforme os resumos reais forem gerados, as leituras aparecem aqui.'}</p>
        <div className="brief-card-meta">
          <span>{main?.tipo_nome || labelTipo(main?.tipo)}</span>
          <span>{sourceLabel}</span>
          <span>{dateLabel}</span>
          {licitacao?.valor_estimado ? <span>{formatMoney(licitacao.valor_estimado)}</span> : null}
        </div>
      </Link>
    </section>
  );
}
