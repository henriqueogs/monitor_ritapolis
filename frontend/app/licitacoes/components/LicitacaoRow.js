import Link from 'next/link';
import QualitySignals from '../../components/QualitySignals';
import StatusBadge from '../../components/StatusBadge';
import { formatDate, formatMoney, labelFonte } from '../../lib/format';

export default function LicitacaoRow({ item }) {
  return (
    <article className="licitacao-row">
      <div className="licitacao-main">
        <div className="document-row-meta">
          <span>{item.fonte_nome || labelFonte(item.fonte)}</span>
          <span>{item.licitacao_detalhes?.modalidade || 'Edital'}</span>
          <span>Abertura: {formatDate(item.data_abertura, 'Nao identificada')}</span>
        </div>
        <h2>
          <Link href={`/documento/${item.id}`}>{item.numero || item.titulo}</Link>
        </h2>
        <p>{item.dados_extras?.licitacao?.objeto || item.resumo || 'Objeto ainda nao identificado.'}</p>
        <QualitySignals documento={item} compact />
      </div>
      <div className="licitacao-side">
        <div className="document-row-field">
          <span>Valor estimado</span>
          <strong>{formatMoney(item.valor_estimado)}</strong>
        </div>
        <StatusBadge value={item.licitacao_detalhes?.status || item.status_coleta} />
      </div>
    </article>
  );
}
