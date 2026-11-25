/**
 * Seção recolhível (<details> nativo: sem JS, teclado e leitor de tela de graça).
 * `resumo` aparece no cabeçalho fechado para o cidadão decidir se abre.
 */
export default function Expansivel({ id, titulo, resumo, children }) {
  if (!children) return null;
  return (
    <details id={id} className="expansivel">
      <summary>
        <span className="expansivel-titulo">{titulo}</span>
        {resumo ? <span className="expansivel-resumo">{resumo}</span> : null}
      </summary>
      <div className="expansivel-corpo">{children}</div>
    </details>
  );
}
