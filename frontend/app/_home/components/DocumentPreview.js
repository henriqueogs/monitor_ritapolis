import Link from 'next/link';
import QualitySignals from '../../components/QualitySignals';
import StatusBadge from '../../components/StatusBadge';
import { bestResumo, formatDate, labelFonte, labelTipo } from '../../lib/format';

export default function DocumentPreview({ documento }) {
  return (
    <Link href={`/documento/${documento.id}`} className="citizen-row">
      <div className="citizen-row-main">
        <div className="document-row-meta">
          <span>{documento.tipo_nome || labelTipo(documento.tipo)}</span>
          <span>{documento.fonte_nome || labelFonte(documento.fonte)}</span>
          <span>{formatDate(documento.data_publicacao || documento.atualizado_em, 'Sem data')}</span>
        </div>
        <strong>{documento.titulo}</strong>
        <p>{bestResumo(documento)}</p>
        <QualitySignals documento={documento} compact />
      </div>
      <div className="citizen-row-side">
        {documento.numero ? <span>Nº {documento.numero}</span> : <span>Sem numero</span>}
        <StatusBadge value={documento.status_coleta} />
      </div>
    </Link>
  );
}
