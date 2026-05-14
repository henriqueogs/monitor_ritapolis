function normalize(items) {
  const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
  return items.map((item) => ({
    ...item,
    percent: Math.max(4, Math.round((Number(item.value || 0) / max) * 100))
  }));
}

export default function AnimatedChartPanel({ title, description, items = [], kind = 'bar', footnote }) {
  const rows = normalize(items.filter((item) => item && item.label));

  return (
    <section className={`chart-panel chart-panel-${kind}`}>
      <div className="chart-panel-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {rows.length ? (
        <div className="chart-bars" role="img" aria-label={description || title}>
          {rows.map((item, index) => (
            <div key={`${item.label}-${index}`} className="chart-row">
              <div className="chart-row-label">
                <span>{item.label}</span>
                <strong>{item.valueLabel || item.value}</strong>
              </div>
              <div className="chart-track">
                <span className="chart-fill" style={{ '--bar-size': `${item.percent}%`, '--delay': `${index * 55}ms` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Ainda nao ha dados suficientes para este grafico.</p>
      )}
      {footnote ? <p className="chart-footnote">{footnote}</p> : null}
    </section>
  );
}
