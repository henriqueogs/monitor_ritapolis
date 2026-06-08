import Link from 'next/link';
import QualitySignals from './QualitySignals';
import StatusBadge from './StatusBadge';
import { cleanDocumentTitle, cleanDocumentSummary, formatDate, labelFonte, labelTipo } from '../lib/format';

export default function DocumentRow({ documento }) {
  return (
    <article className="document-row">
      <div className="document-row-main">
        <div className="document-row-meta">
          <span>{documento.tipo_nome || labelTipo(documento.tipo)}</span>
          <span>{documento.fonte_nome || labelFonte(documento.fonte)}</span>
          <span>{formatDate(documento.data_publicacao || documento.atualizado_em)}</span>
        </div>
        <h3>
          <Link href={`/documento/${documento.id}`}>{cleanDocumentTitle(documento)}</Link>
        </h3>
        <p>{cleanDocumentSummary(documento)}</p>
        <QualitySignals documento={documento} compact />
      </div>
      <div className="document-row-side">
        <div className="document-row-field">
          <span>Numero</span>
          <strong>{documento.numero || 'Nao identificado'}</strong>
        </div>
        <StatusBadge value={documento.status_coleta} />
      </div>
    </article>
  );
}
