import { getFallbackSourceUrl, getOfficialFileUrl, getSpecificSourcePageUrl } from '../lib/source-links';

export default function DocumentPreviewPane({ documento }) {
  const officialFileUrl = getOfficialFileUrl(documento);
  const sourcePageUrl = getSpecificSourcePageUrl(documento);
  const fallbackSourceUrl = getFallbackSourceUrl(documento);
  const previewUrl = officialFileUrl || sourcePageUrl || fallbackSourceUrl;

  return (
    <section className="document-preview-pane">
      <div className="document-preview-head">
        <div>
          <h2>Preview da fonte oficial</h2>
          <p>Use como conferencia visual. A leitura completa continua no arquivo original.</p>
        </div>
        {previewUrl ? (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
        ) : null}
      </div>
      {previewUrl ? (
        <iframe src={previewUrl} title={`Preview de ${documento.titulo}`} loading="lazy" />
      ) : (
        <div className="document-preview-empty">
          <strong>Preview indisponivel</strong>
          <p>Este registro ainda nao tem arquivo ou pagina especifica vinculada.</p>
        </div>
      )}
    </section>
  );
}
