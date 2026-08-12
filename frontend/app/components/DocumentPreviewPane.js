import {
  getEmbeddableOfficialFileUrl,
  getFallbackSourceUrl,
  getOfficialFileUrl,
  getSpecificSourcePageUrl,
  getOrigemGenericaUrl,
} from '../lib/source-links';

export default function DocumentPreviewPane({ documento }) {
  const officialFileUrl = getOfficialFileUrl(documento);
  const sourcePageUrl = getSpecificSourcePageUrl(documento);
  const fallbackSourceUrl = getFallbackSourceUrl(documento);
  // Somente arquivos que aceitam iframe devem virar preview. Páginas como o
  // PNCP recusam incorporação e precisam ser abertas diretamente.
  const previewUrl = getEmbeddableOfficialFileUrl(documento);
  // Origem de último recurso (listagem) — não embutimos em iframe, mas sempre
  // oferecemos o link: todo documento tem de onde veio.
  const origemUrl =
    officialFileUrl || sourcePageUrl || fallbackSourceUrl || getOrigemGenericaUrl(documento);
  const hasSpecificSource = Boolean(officialFileUrl || sourcePageUrl || fallbackSourceUrl);

  return (
    <section className="document-preview-pane">
      <div className="document-preview-head">
        <div>
          <h2>{previewUrl ? 'Preview da fonte oficial' : 'Fonte oficial'}</h2>
          <p>
            {previewUrl
              ? 'Use como conferência visual. A leitura completa continua no arquivo original.'
              : 'Consulte a publicação diretamente no portal responsável.'}
          </p>
        </div>
        {origemUrl ? (
          <a href={origemUrl} target="_blank" rel="noopener noreferrer">
            Abrir fonte oficial
          </a>
        ) : null}
      </div>
      {previewUrl ? (
        <iframe src={previewUrl} title={`Preview de ${documento.titulo}`} loading="lazy" />
      ) : (
        <div className="document-preview-empty">
          <strong>
            {hasSpecificSource
              ? 'Visualização disponível no portal oficial'
              : 'Sem arquivo individual na fonte'}
          </strong>
          <p>
            {hasSpecificSource
              ? 'Esta fonte não permite visualização incorporada. Use “Abrir fonte oficial” para consultar o conteúdo completo em uma nova aba.'
              : origemUrl
                ? 'Este documento foi publicado em uma listagem oficial, sem arquivo individual. Use “Abrir fonte oficial” para consultar a publicação de origem.'
                : 'Este registro ainda nao tem arquivo ou pagina especifica vinculada.'}
          </p>
        </div>
      )}
    </section>
  );
}
