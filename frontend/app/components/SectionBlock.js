export default function SectionBlock({ title, description, children, aside }) {
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
