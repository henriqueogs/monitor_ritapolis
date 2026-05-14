import Link from 'next/link';
import DataAvailabilityBadge from './DataAvailabilityBadge';
import { bestResumo, formatDate, formatMoney, labelFonte, labelTipo } from '../lib/format';

export default function IntelligenceBrief({ resumoAi, publicacao, licitacao }) {
  const main = resumoAi || publicacao || licitacao;
  const sourceLabel = main?.fonte_nome || labelFonte(main?.fonte);
  const dateLabel = formatDate(main?.data_publicacao || main?.atualizado_em || main?.data_abertura, 'Data nao identificada');

  return (
    <section className="brief-shell">
      <div className="brief-copy">
        <div className="brief-kicker">
          <DataAvailabilityBadge status={resumoAi ? 'real' : 'parcial'} />
          <span>Observatorio publico</span>
        </div>
        <h1>O que esta acontecendo agora em Ritapolis</h1>
        <p>
          Acompanhe atos, licitacoes e leituras de IA com caminho direto para a fonte. O foco aqui e entendimento:
          primeiro o significado, depois o documento.
        </p>
        <form action="/documentos" className="brief-search">
          <input name="q" placeholder="Buscar por merenda, obra, transporte, lei, edital..." />
          <button type="submit">Explorar evidencias</button>
        </form>
      </div>

      <Link href={main?.id ? `/documento/${main.id}` : '/analises'} className="brief-card">
        <span className="brief-card-label">{resumoAi ? 'Leitura de IA' : 'Publicacao recente'}</span>
        <h2>{main?.titulo_curto || main?.titulo || 'Analises ainda em preparacao'}</h2>
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
