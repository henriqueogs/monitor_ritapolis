// Link pra fonte real do dado: a ata (anexo) quando o valor veio dela;
// senão o PDF/página oficial do documento. §11.3 — origem sempre rastreável.
export default function FonteLink({ anexoOrigemId, urlPdf, urlOrigem, rotuloAnexo = 'ver na ata', rotuloDoc = 'ver na fonte' }) {
  if (anexoOrigemId) {
    return (
      <a href={`/anexo/${anexoOrigemId}`} style={{ fontSize: 12 }}>
        {rotuloAnexo} →
      </a>
    );
  }
  const url = urlPdf || urlOrigem;
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
      {rotuloDoc} ↗
    </a>
  );
}
