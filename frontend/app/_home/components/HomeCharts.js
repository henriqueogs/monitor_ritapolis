import AnimatedChartPanel from '../../components/AnimatedChartPanel';
import AnalysisFeed from './AnalysisFeed';

export default function HomeCharts({ analisesItens, charts }) {
  return (
    <>
      <section className="observatory-grid">
        <AnalysisFeed itens={analisesItens} />
        <AnimatedChartPanel
          title="Ritmo de publicacoes"
          description="Atos publicados por ano na base local."
          items={charts.atividadePorAno}
          footnote="Fonte: documentos ja coletados da Prefeitura e da Camara."
        />
      </section>

      <section className="observatory-grid observatory-grid-secondary">
        <AnimatedChartPanel
          title="Tipos de atos"
          description="Distribuicao por natureza documental."
          items={charts.temasPorTipo}
        />
        <AnimatedChartPanel
          title="Compras com valor identificado"
          description="Valores estimados extraidos da fonte atual."
          items={charts.comprasComValor}
          footnote="Vencedor, valor final e contratos dependem de PNCP/transparencia."
        />
      </section>
    </>
  );
}
