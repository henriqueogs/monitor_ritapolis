import {
  getFallbackSourceUrl,
  getOfficialFileUrl,
  getSpecificSourcePageUrl,
  getOrigemGenericaUrl,
} from '../lib/source-links';

export default function SourceLinks({ documento }) {
  const officialFileUrl = getOfficialFileUrl(documento);
  const sourcePageUrl = getSpecificSourcePageUrl(documento);
  const fallbackSourceUrl = getFallbackSourceUrl(documento);
  // Origem de último recurso: a listagem/módulo de onde o documento foi raspado.
  // Todo documento tem procedência — nunca "indisponível" quando há url_origem.
  const origemGenericaUrl = getOrigemGenericaUrl(documento);
  const primaryUrl = officialFileUrl || sourcePageUrl || fallbackSourceUrl || origemGenericaUrl;
  const showSourcePage = sourcePageUrl && sourcePageUrl !== primaryUrl;
  const primaryIsGenerica =
    !officialFileUrl && !sourcePageUrl && !fallbackSourceUrl && !!origemGenericaUrl;

  let primaryLabel = 'Abrir consulta da fonte';
  if (officialFileUrl) {
    primaryLabel = 'Abrir arquivo oficial';
  } else if (primaryIsGenerica) {
    primaryLabel = 'Abrir página da fonte na Prefeitura';
  }

  return (
    <div className="action-list">
      {primaryUrl ? (
        <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="button button-secondary">
          {primaryLabel}
        </a>
      ) : (
        <span className="button button-disabled">Fonte oficial indisponivel</span>
      )}
      {showSourcePage ? (
        <a href={sourcePageUrl} target="_blank" rel="noopener noreferrer" className="button button-secondary">
          Abrir pagina da fonte
        </a>
      ) : null}
      {primaryIsGenerica ? (
        <p className="source-note">
          Publicado na listagem oficial da Prefeitura, sem arquivo individual na fonte. Os dados
          exibidos foram extraídos dessa publicação.
        </p>
      ) : null}
    </div>
  );
}
