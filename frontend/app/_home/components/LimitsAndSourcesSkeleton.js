import SectionBlock from '../../components/SectionBlock';

export default function LimitsAndSourcesSkeleton() {
  return (
    <SectionBlock title="Fontes oficiais">
      <div className="simple-table" aria-busy="true" aria-label="Carregando">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton skeleton-line" style={{ margin: '10px 0' }} />
        ))}
      </div>
    </SectionBlock>
  );
}
