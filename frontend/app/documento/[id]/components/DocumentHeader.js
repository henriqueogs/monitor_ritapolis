import QualitySignals from '../../../components/QualitySignals';
import StatusBadge from '../../../components/StatusBadge';
import { splitDocumentTitle, formatDate, labelFonte, labelTipo } from '../../../lib/format';

export default function DocumentHeader({ documento, licitacao }) {
  const { titulo, subtitulo } = splitDocumentTitle(documento);
  return (
    <div className="page-title page-title-detail">
      <div>
        <div className="document-row-meta">
          <span>{documento.fonte_nome || labelFonte(documento.fonte)}</span>
          <span>{documento.tipo_nome || labelTipo(documento.tipo)}</span>
          <span>{formatDate(documento.data_publicacao || documento.atualizado_em)}</span>
        </div>
        {subtitulo ? <p className="page-title-subtitle">{subtitulo}</p> : null}
        <h1>{titulo}</h1>
        <QualitySignals documento={documento} />
      </div>
      <StatusBadge value={licitacao?.status || documento.status_coleta} />
    </div>
  );
}
