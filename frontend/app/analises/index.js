import AnimatedChartPanel from '../components/AnimatedChartPanel';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import SectionBlock from '../components/SectionBlock';
import { fetchAnalisesResumos } from '../lib/api';
import { labelTipo } from '../lib/format';
import AnalysisFilters from './components/AnalysisFilters';
import AnalysisList from './components/AnalysisList';
import styles from './styles.module.css';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

export default async function AnalisesPage({ searchParams }) {
  const filters = {
    tipo: currentValue(searchParams, 'tipo'),
    limite: currentValue(searchParams, 'limite') || '50'
  };
  const data = await fetchAnalisesResumos(filters);
  const totais = data.totais || {};
  const chartItems = (data.por_tipo || []).map((row) => ({
    label: row.tipo_nome || labelTipo(row.tipo),
    value: row.total,
    valueLabel: `${row.total}`
  }));

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Analises verificaveis</h1>
          <p>Leituras feitas a partir de resumos IA reais ja salvos. Cada item aponta para o documento oficial e deixa claro quando a cobertura ainda e limitada.</p>
        </div>
        <DataAvailabilityBadge status={totais.documentos_analisados ? 'real' : 'pendente'} />
      </div>

      <AnalysisFilters filters={filters} />

      <div className="observatory-grid">
        <AnimatedChartPanel title="Leituras disponiveis por tipo" description="Distribuicao das analises ja geradas pela IA." items={chartItems} footnote="A cobertura completa continua na area administrativa." />
        <SectionBlock title="Como ler estas analises">
          <div className={styles.statusList}>
            <div className={styles.statusRow}>
              <div>
                <strong>Conclusoes apoiadas por fonte</strong>
                <p>Cada leitura abre o documento original e mostra os campos que a IA conseguiu sustentar.</p>
              </div>
              <DataAvailabilityBadge status="real" />
            </div>
            <div className={styles.statusRow}>
              <div>
                <strong>Limites ainda visiveis</strong>
                <p>Comparacoes financeiras amplas dependem de PNCP, contratos e portal de transparencia.</p>
              </div>
              <DataAvailabilityBadge status="pendente" />
            </div>
          </div>
        </SectionBlock>
      </div>

      <SectionBlock title="Feed de inteligencia" description="Cada analise abaixo diferencia dado extraido, inferencia de IA e campo ausente.">
        <AnalysisList itens={data.itens || []} />
      </SectionBlock>
    </main>
  );
}
