export default function SectionBlock({ title, description, children, aside, bare = false }) {
  // bare: conteúdo embutido em outro bloco (ex.: painel de aba) — sem card nem h2 próprios.
  if (bare) {
    return (
      <div>
        <div className="section-head">
          {description ? <p className="section-note" style={{ margin: 0 }}>{description}</p> : <span />}
          {aside ? <div className="section-aside">{aside}</div> : null}
        </div>
        {children}
      </div>
    );
  }
  return (
    <section className="section-block">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {description ? <p className="section-note">{description}</p> : null}
        </div>
        {aside ? <div className="section-aside">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}
