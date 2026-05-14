import { formatDate, labelFonte } from '../lib/format';
import { getFallbackSourceUrl, getOfficialFileUrl, getSpecificSourcePageUrl } from '../lib/source-links';

export default function SourceTrace({ documento }) {
  const officialFileUrl = getOfficialFileUrl(documento);
  const sourcePageUrl = getSpecificSourcePageUrl(documento);
  const fallbackSourceUrl = getFallbackSourceUrl(documento);
  const linkUrl = officialFileUrl || sourcePageUrl || fallbackSourceUrl;

  return (
    <div className="source-trace">
      <div>
        <strong>{documento.fonte_nome || labelFonte(documento.fonte)}</strong>
        <p>
          Coletado em {formatDate(documento.coletado_em || documento.atualizado_em)}.{' '}
          {documento.indicadores?.tem_texto_extraido
            ? `${documento.texto_completo_chars?.toLocaleString('pt-BR') || 0} caracteres extraidos.`
            : 'Texto ainda nao extraido.'}
        </p>
      </div>
      {linkUrl ? (
        <a href={linkUrl} target="_blank" rel="noopener noreferrer">
          {officialFileUrl ? 'Abrir arquivo oficial' : 'Abrir fonte'}
        </a>
      ) : (
        <span>Fonte indisponivel</span>
      )}
    </div>
  );
}
