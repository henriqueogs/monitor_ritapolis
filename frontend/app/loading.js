// Feedback instantâneo em cada navegação: o App Router mostra este esqueleto
// imediatamente ao clicar, enquanto a página (server component) carrega os dados.
export default function Loading() {
  return (
    <main className="page-container" aria-busy="true" aria-label="Carregando">
      <div className="page-title">
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" style={{ maxWidth: 360 }} />
        </div>
      </div>
      <div className="admin-metric-grid" style={{ marginBottom: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="admin-metric-card">
            <div className="skeleton skeleton-line" style={{ maxWidth: 90 }} />
            <div className="skeleton skeleton-strong" style={{ maxWidth: 120 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 20 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton-line" style={{ margin: '12px 0' }} />
        ))}
      </div>
    </main>
  );
}
