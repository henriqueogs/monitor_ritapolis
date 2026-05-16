import Link from 'next/link';
import AnimatedChartPanel from '../components/AnimatedChartPanel';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import SectionBlock from '../components/SectionBlock';
import { fetchAnalisesResumos, fetchEstatisticas } from '../lib/api';
import { labelTipo } from '../lib/format';
import RecentThemeAnalyses from './components/RecentThemeAnalyses';
import TopicGrid from './components/TopicGrid';
import styles from './styles.module.css';

const temasPlanejados = [
  { nome: 'Educacao', termos: 'merenda, transporte escolar, uniforme, escola', status: 'parcial' },
  { nome: 'Saude', termos: 'medicamentos, atendimento, unidade de saude', status: 'pendente' },
  { nome: 'Obras', termos: 'obra, reforma, pavimentacao, manutencao', status: 'pendente' },
  { nome: 'Licitacoes', termos: 'editais, pregoes, dispensas e compras publicas', status: 'real', href: '/licitacoes' },
  { nome: 'Camara', termos: 'leis, atas, portarias e atos legislativos', status: 'real', href: '/documentos?fonte=camara' }
];

export default async function TemasPage() {
  const [estatisticas, analises] = await Promise.all([
    fetchEstatisticas(),
    fetchAnalisesResumos({ limite: 8 }).catch(() => ({ itens: [] }))
  ]);
  const tipoChart = (estatisticas.por_tipo || []).slice(0, 6).map((item) => ({
    label: item.tipo_nome || labelTipo(item.tipo),
    value: item.total,
    valueLabel: `${item.total}`
  }));

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Temas publicos</h1>
          <p>Uma ponte entre documentos oficiais e assuntos que as pessoas procuram. Alguns temas ja usam dados reais; outros dependem de classificacao e novas integracoes.</p>
        </div>
        <DataAvailabilityBadge status="parcial" />
      </div>

      <section className="topic-hero">
        <div>
          <h2>Comece por assunto, aprofunde por evidencias</h2>
          <p>Os temas ainda nao sao uma classificacao oficial completa. Eles funcionam como portas de entrada para explorar documentos, leituras de IA e lacunas conhecidas.</p>
        </div>
        <Link href="/analises" className="button button-primary">Ver analises</Link>
      </section>

      <div className={styles.contentGrid}>
        <AnimatedChartPanel
          title="Atos por natureza"
          description="Enquanto os temas consolidados nao existem, a natureza documental ajuda a navegar."
          items={tipoChart}
        />
        <RecentThemeAnalyses itens={analises.itens || []} />
      </div>

      <TopicGrid temas={temasPlanejados} />

      <SectionBlock title="O que falta para temas consolidados">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Classificador tematico revisavel</strong>
              <p>Necessario para afirmar que um documento pertence a Educacao, Saude ou Obras sem depender apenas de busca textual.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Entidades e relacoes</strong>
              <p>Fornecedores, orgaos, processos e documentos relacionados precisam ser consolidados em dados estruturados.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
        </div>
      </SectionBlock>
    </main>
  );
}
