import AnimatedChartPanel from '../../components/AnimatedChartPanel';
import AnalysisFeed from './AnalysisFeed';

export default function HomeCharts({ analisesItens, charts }) {
  return (
    <section className="observatory-grid">
      <AnalysisFeed itens={analisesItens} />
      <AnimatedChartPanel
        title="Ritmo de publicacoes"
        description="Atos publicados por ano na base local, do mais recente ao mais antigo."
        items={charts.atividadePorAno}
        footnote="Fonte: documentos ja coletados da Prefeitura e da Camara."
      />
    </section>
  );
}
