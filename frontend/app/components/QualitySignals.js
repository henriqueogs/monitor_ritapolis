function fallbackIndicadores(documento) {
  const alertas = documento?.qualidade_alertas || [];

  return {
    tem_pdf: Boolean(documento?.url_pdf),
    tem_texto_extraido: Boolean(documento?.texto_completo || documento?.texto_completo_chars),
    tem_resumo_ai: Boolean(documento?.resumo_ai || documento?.tem_resumo_ai),
    dados_incompletos: alertas.length > 0
  };
}

export default function QualitySignals({ documento, compact = false }) {
  const indicadores = documento?.indicadores || fallbackIndicadores(documento);
  const items = [
    {
      key: 'pdf',
      label: indicadores.tem_pdf ? 'Fonte oficial' : 'Sem arquivo',
      tone: indicadores.tem_pdf ? 'ok' : 'warn'
    },
    {
      key: 'texto',
      label: indicadores.tem_texto_extraido ? 'Texto extraido' : 'Sem texto',
      tone: indicadores.tem_texto_extraido ? 'ok' : 'warn'
    },
    {
      key: 'ia',
      label: indicadores.tem_resumo_ai ? 'Resumo automatico' : 'Sem resumo IA',
      tone: indicadores.tem_resumo_ai ? 'ok' : 'neutral'
    }
  ];

  if (indicadores.dados_incompletos) {
    items.push({
      key: 'alertas',
      label: 'Dados incompletos',
      tone: 'warn'
    });
  }

  const visibleItems = compact
    ? items.filter((item) => item.key === 'pdf' || item.key === 'ia' || item.key === 'alertas').slice(0, 2)
    : items;

  return (
    <div className={compact ? 'quality-signals quality-signals-compact' : 'quality-signals'}>
      {visibleItems.map((item) => (
        <span key={item.key} className={`quality-signal is-${item.tone}`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}
