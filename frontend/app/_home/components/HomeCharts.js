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

      {charts.modalidadesAno?.length ? (
        <section className="observatory-grid observatory-grid-secondary">
          <AnimatedChartPanel
            title={`Modalidades ${charts.licitacoesAno?.ano || ''}`}
            description="Como as licitacoes deste ano estao distribuidas por modalidade."
            items={charts.modalidadesAno}
          />
          <AnimatedChartPanel
            title={`Cobertura IA ${charts.licitacoesAno?.ano || ''}`}
            description="Editais deste ano com resumo e leitura integrada gerados pela IA."
            items={charts.licitacoesAno?.total ? [
              { label: 'Com resumo IA', value: charts.licitacoesAno.com_resumo_ai || 0, valueLabel: `${charts.licitacoesAno.com_resumo_ai || 0} de ${charts.licitacoesAno.total}` },
              { label: 'Com leitura integrada', value: charts.licitacoesAno.com_leitura_integrada || 0, valueLabel: `${charts.licitacoesAno.com_leitura_integrada || 0} de ${charts.licitacoesAno.total}` },
              { label: 'Com vencedor identificado', value: charts.licitacoesAno.com_vencedor || 0, valueLabel: `${charts.licitacoesAno.com_vencedor || 0} de ${charts.licitacoesAno.total}` }
            ] : []}
            footnote="Cobertura em expansao continua."
          />
        </section>
      ) : null}
    </>
  );
}
