import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import DataAvailabilityBadge from '../../components/DataAvailabilityBadge';
import StatusBadge from '../../components/StatusBadge';
import { formatDate, formatMoney } from '../../lib/format';

function firstValue(item) {
  return item.valores?.[0]?.valor ?? item.valor_estimado ?? null;
}

function firstDate(item) {
  return item.datas_relevantes?.[0]?.data || item.data_abertura || item.data_publicacao || null;
}

export default function AnalysisList({ itens }) {
  if (!itens?.length) {
    return <p className="empty-state">Nenhum resumo encontrado para estes filtros.</p>;
  }

  return (
    <div className="analysis-list">
      {itens.map((item) => (
        <article key={item.documento_id} className="analysis-row animate-fade-in-up">
          <div className="analysis-main">
            <div className="document-row-meta">
              <span>{item.tipo_nome}</span>
              <span>{item.fonte_nome}</span>
              <span>{item.ano || 'Sem ano'}</span>
              <span className="availability-badge is-real"><Sparkles size={11} /> IA real</span>
            </div>
            <h2>
              <Link href={`/documento/${item.documento_id}`}>
                {item.titulo_curto || item.numero || item.titulo}
              </Link>
            </h2>
            <p>{item.objeto || item.resumo_cidadao || 'Resumo direto ainda não disponível.'}</p>
            {item.pontos_principais?.length ? (
              <ul className="plain-list">
                {item.pontos_principais.slice(0, 3).map((ponto) => <li key={ponto}>{ponto}</li>)}
              </ul>
            ) : null}
            <div className="analysis-validation-line">
              <DataAvailabilityBadge status="real" />
              <span>Conclusão baseada no resumo IA salvo e no documento vinculado.</span>
            </div>
          </div>
          <div className="analysis-side">
            <div className="document-row-field"><span>Valor</span><strong>{formatMoney(firstValue(item))}</strong></div>
            <div className="document-row-field"><span>Data</span><strong>{formatDate(firstDate(item), 'Não identificada')}</strong></div>
            <StatusBadge value={item.riscos_ou_alertas?.length ? 'revisar' : 'ok'} />
          </div>
        </article>
      ))}
    </div>
  );
}
