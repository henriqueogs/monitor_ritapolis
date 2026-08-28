import Link from 'next/link';
import { splitDocumentTitle, cleanDocumentSummary, formatDate, labelFonte, labelTipo } from '../../lib/format';

export default function DocumentPreview({ documento }) {
  const { titulo, subtitulo } = splitDocumentTitle(documento);
  return (
    <Link href={`/documento/${documento.id}`} className="citizen-row">
      <div className="citizen-row-main">
        <div className="document-row-meta">
          <span>{documento.tipo_nome || labelTipo(documento.tipo)}</span>
          <span>{documento.fonte_nome || labelFonte(documento.fonte)}</span>
          {documento.data_publicacao ? (
            <span>{formatDate(documento.data_publicacao, 'Sem data')}</span>
          ) : null}
        </div>
        {subtitulo ? <p className="page-title-subtitle">{subtitulo}</p> : null}
        <strong>{titulo}</strong>
        <p>{cleanDocumentSummary(documento)}</p>
      </div>
      <div className="citizen-row-side">
        {documento.numero ? <span>Nº {documento.numero}</span> : null}
      </div>
    </Link>
  );
}
