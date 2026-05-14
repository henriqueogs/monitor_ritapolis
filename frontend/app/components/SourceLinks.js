import { getFallbackSourceUrl, getOfficialFileUrl, getSpecificSourcePageUrl } from '../lib/source-links';

export default function SourceLinks({ documento }) {
  const officialFileUrl = getOfficialFileUrl(documento);
  const sourcePageUrl = getSpecificSourcePageUrl(documento);
  const fallbackSourceUrl = getFallbackSourceUrl(documento);
  const primaryUrl = officialFileUrl || sourcePageUrl || fallbackSourceUrl;
  const showSourcePage = sourcePageUrl && sourcePageUrl !== primaryUrl;

  return (
    <div className="action-list">
      {primaryUrl ? (
        <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="button button-secondary">
          {officialFileUrl ? 'Abrir arquivo oficial' : 'Abrir consulta da fonte'}
        </a>
      ) : (
        <span className="button button-disabled">Fonte oficial indisponivel</span>
      )}
      {showSourcePage ? (
        <a href={sourcePageUrl} target="_blank" rel="noopener noreferrer" className="button button-secondary">
          Abrir pagina da fonte
        </a>
      ) : null}
    </div>
  );
}
