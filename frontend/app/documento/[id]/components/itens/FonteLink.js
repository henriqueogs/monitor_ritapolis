// Link pra fonte real do dado: a ata (anexo) quando o valor veio dela;
// senão o PDF/página oficial do documento. §11.3 — origem sempre rastreável.
export default function FonteLink({ anexoOrigemId, fonte, trechoFonte, urlPdf, urlOrigem, rotuloAnexo = 'ver na ata', rotuloDoc = 'ver na fonte' }) {
  if (trechoFonte) {
    const url = fonte ? fonte.url : (urlPdf || urlOrigem);
    const safeUrl = /^https?:\/\//i.test(url || '') ? url : null;
    return (
      <details style={{ marginTop: 6, fontSize: 12 }}>
        <summary>Trecho da fonte</summary>
        <blockquote style={{ margin: '6px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{trechoFonte}</blockquote>
        {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer">ver na fonte ↗</a> : null}
      </details>
    );
  }
  if (anexoOrigemId) {
    return (
      <a href={`/anexo/${anexoOrigemId}`} style={{ fontSize: 12 }}>
        {rotuloAnexo} →
      </a>
    );
  }
  const url = urlPdf || urlOrigem;
  if (!/^https?:\/\//i.test(url || '')) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
      {rotuloDoc} ↗
    </a>
  );
}
