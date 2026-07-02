import Link from 'next/link';
import SectionBlock from '../components/SectionBlock';
import { fetchTransparenciaResumo } from '../lib/api';
import PeriodoSelector from './components/PeriodoSelector';
import MetricasPeriodo from './components/MetricasPeriodo';
import TabelaExercicios from './components/TabelaExercicios';
import ComposicaoReceita from './components/ComposicaoReceita';
import TopCredores from './components/TopCredores';
import EmpenhosRecentes from './components/EmpenhosRecentes';
import TiposEmpenho from './components/TiposEmpenho';
import StatusColeta from './components/StatusColeta';

export const metadata = {
  title: 'Dinheiro público — Monitor Ritápolis',
  description:
    'Orçamento, empenhos, pagamentos e fornecedores da Prefeitura de Ritápolis, por mandato e exercício.',
};

const PORTAL_URL = 'https://pt.ritapolis.mg.gov.br/Tempo_Real_Despesa';

function resolverFiltro(searchParams) {
  if (searchParams?.exercicio) {
    return { modo: 'exercicio', fetchParams: { exercicio: Number(searchParams.exercicio) } };
  }
  if (searchParams?.mandato) {
    return { modo: 'mandato', fetchParams: { mandato: Number(searchParams.mandato) } };
  }
  if (searchParams?.periodo === 'todos') {
    return { modo: 'todos', fetchParams: {} };
  }
  // Padrão: mandato em curso — o backend normaliza o ano pro início do mandato.
  return { modo: 'mandato', fetchParams: { mandato: new Date().getFullYear() } };
}

function montarPeriodoLabel(modo, periodo, porMandato) {
  if (modo === 'exercicio') return String(periodo.exercicio);
  if (modo === 'mandato' && periodo.mandato) {
    const grupo = (porMandato || []).find((m) => m.inicio === periodo.mandato.inicio);
    const anos = grupo?.anos || [];
    if (anos.length === 1) return String(anos[0]);
    if (anos.length > 1) return `${anos[0]}–${anos[anos.length - 1]}`;
    return `${periodo.mandato.inicio}–${periodo.mandato.fim}`;
  }
  const [min, max] = periodo.anos_cobertos || [];
  return min && max ? (min === max ? String(min) : `${min}–${max}`) : 'período coletado';
}

export default async function TransparenciaPage({ searchParams }) {
  const { modo, fetchParams } = resolverFiltro(searchParams);
  const dados = await fetchTransparenciaResumo(fetchParams);

  if (!dados || !dados.periodo) {
    return (
      <main className="page-container">
        <div className="page-hero">
          <h1>Dinheiro público</h1>
          <p className="page-hero-sub">Dados do Portal da Transparência indisponíveis no momento.</p>
        </div>
      </main>
    );
  }

  const { total, porAno, porMandato, periodo, topCredores, ultimosEmpenhos, logs, tiposEmpenho, receitasPorAno } = dados;
  const periodoLabel = montarPeriodoLabel(modo, periodo, porMandato);
  const pctVinculado = total.n_empenhos
    ? Math.round((total.n_licitacoes_vinculadas / total.n_empenhos) * 100)
    : 0;

  return (
    <main className="page-container">
      <div className="page-hero">
        <h1>Dinheiro público</h1>
        <p className="page-hero-sub">
          Orçamento, empenhos, pagamentos e fornecedores da Prefeitura de Ritápolis — fonte:{' '}
          <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
            pt.ritapolis.mg.gov.br
          </a>
          , cruzado com o acervo de licitações.
        </p>
      </div>

      <PeriodoSelector porMandato={porMandato} periodo={periodo} anosCobertos={periodo.anos_cobertos} modo={modo} />

      <MetricasPeriodo total={total} periodoLabel={periodoLabel} pctVinculado={pctVinculado} />

      <TabelaExercicios porAno={porAno} porMandato={porMandato} />

      <ComposicaoReceita receitasPorAno={receitasPorAno} porAno={porAno} />

      <TopCredores topCredores={topCredores} periodoLabel={periodoLabel} />

      <EmpenhosRecentes ultimosEmpenhos={ultimosEmpenhos} periodoLabel={periodoLabel} />

      <TiposEmpenho tiposEmpenho={tiposEmpenho} valorTotal={total.valor_total} periodoLabel={periodoLabel} />

      {/* Análises de preço vivem na Inteligência — aqui só o convite */}
      <SectionBlock
        title="Evolução de preços por produto"
        description="Mesmo item comprado em anos diferentes, agrupado por similaridade (IA) — como o preço unitário pago variou ao longo do tempo."
      >
        <Link href="/inteligencia" className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
          Ver análise de preços na Inteligência →
        </Link>
      </SectionBlock>

      <StatusColeta logs={logs} />
    </main>
  );
}
