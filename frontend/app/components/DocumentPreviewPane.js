import {
  getFallbackSourceUrl,
  getOfficialFileUrl,
  getSpecificSourcePageUrl,
  getOrigemGenericaUrl,
} from '../lib/source-links';

export default function DocumentPreviewPane({ documento }) {
  const officialFileUrl = getOfficialFileUrl(documento);
  const sourcePageUrl = getSpecificSourcePageUrl(documento);
  const fallbackSourceUrl = getFallbackSourceUrl(documento);
  // URL específica que vale embutir como preview visual
  const previewUrl = officialFileUrl || sourcePageUrl || fallbackSourceUrl;
  // Origem de último recurso (listagem) — não embutimos em iframe, mas sempre
  // oferecemos o link: todo documento tem de onde veio.
  const origemUrl = previewUrl || getOrigemGenericaUrl(documento);

  return (
    <section className="document-preview-pane">
      <div className="document-preview-head">
        <div>
          <h2>Preview da fonte oficial</h2>
          <p>Use como conferencia visual. A leitura completa continua no arquivo original.</p>
        </div>
        {origemUrl ? (
          <a href={origemUrl} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
        ) : null}
      </div>
      {previewUrl ? (
        <iframe src={previewUrl} title={`Preview de ${documento.titulo}`} loading="lazy" />
      ) : (
        <div className="document-preview-empty">
          <strong>Sem arquivo individual na fonte</strong>
          <p>
            {origemUrl
              ? 'Este documento foi publicado na listagem oficial da Prefeitura, sem PDF próprio. Use “Abrir em nova aba” para ver a publicação de origem.'
              : 'Este registro ainda nao tem arquivo ou pagina especifica vinculada.'}
          </p>
        </div>
      )}
    </section>
  );
}
