import AnalysisFeed from './AnalysisFeed';

export default function HomeCharts({ analisesItens }) {
  return (
    <div className="content-stack">
      <AnalysisFeed itens={analisesItens} />
    </div>
  );
}
