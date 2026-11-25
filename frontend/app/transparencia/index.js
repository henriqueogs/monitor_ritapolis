import AreaSearchForm from '../components/AreaSearchForm';
import IntelligenceBrief from '../components/IntelligenceBrief';
import SectionBlock from '../components/SectionBlock';
import {
  fetchAnalisesResumos,
  fetchDocumentos,
  fetchFilaPagamentos,
  fetchTransparenciaGastos,
  fetchTransparenciaResumo,
} from '../lib/api';
import { TIPOS_DINHEIRO_PUBLICO } from '../lib/areas';
import { formatDate, formatMoney } from '../lib/format';
import FilaPagamentos from './components/FilaPagamentos';
import FinalidadesResumo from './components/FinalidadesResumo';
import GastosPorCategoria from './components/GastosPorCategoria';
import PeriodoSelector from '../components/PeriodoSelector';
import MetricasPeriodo from './components/MetricasPeriodo';
import TabelaExercicios from './components/TabelaExercicios';
import ComposicaoReceita from './components/ComposicaoReceita';
import TopCredores from './components/TopCredores';
import TiposEmpenho from './components/TiposEmpenho';
import StatusColeta from './components/StatusColeta';
import AbasDestino from './components/AbasDestino';
import ModulosArea from '../components/ModulosArea';
import Expansivel from './components/Expansivel';
import { HOST_PORTAL_TRANSPARENCIA, PORTAL_TRANSPARENCIA_DESPESAS } from '../../lib/ente';
import { montarPeriodoLabel } from '../../lib/periodo-label';

export const metadata = {
  title: 'Dinheiro público',
  description:
    'Orçamento, empenhos, pagamentos e fornecedores da Prefeitura de Ritápolis, por mandato e exercício.',
};

const PORTAL_URL = PORTAL_TRANSPARENCIA_DESPESAS;

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

export default async function TransparenciaPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const { modo, fetchParams } = resolverFiltro(searchParams);
  const tiposDinheiro = TIPOS_DINHEIRO_PUBLICO.join(',');
  const [dados, gastos, fila, analises, publicacoesRecentes] = await Promise.all([
    fetchTransparenciaResumo(fetchParams),
    fetchTransparenciaGastos(fetchParams),
    // Fila filtra só por exercício (mandato não se aplica a pendência atual)
    fetchFilaPagamentos(fetchParams.exercicio ? { exercicio: fetchParams.exercicio } : {}),
    fetchAnalisesResumos({ tipo: tiposDinheiro, limite: 6 }).catch(() => ({ itens: [] })),
    fetchDocumentos({ tipo: tiposDinheiro, limite: 1 }).catch(() => ({ dados: [] })),
  ]);
  const destaqueIa = analises.itens?.[0]
    ? {
        ...analises.itens[0],
        id: analises.itens[0].documento_id,
        resumo: analises.itens[0].objeto || analises.itens[0].resumo_cidadao,
        titulo: analises.itens[0].titulo_curto || analises.itens[0].titulo,
      }
    : null;
  const ultimaPublicacao = publicacoesRecentes.dados?.[0] || null;

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

  const { total, porAno, porMandato, periodo, topCredores, logs, tiposEmpenho, receitasPorAno, finalidadesEmpenho } = dados;
  const periodoLabel = montarPeriodoLabel(modo, periodo, porMandato);
  const historicoLabel = montarPeriodoLabel('todos', periodo, porMandato);
  // Máximo em vez de logs[0]: não depender da ordem que a API devolve.
  const ultimaColeta = (logs || []).map((l) => l.coletado_em).filter(Boolean).sort().at(-1);
  const queryPeriodo = modo === 'todos'
    ? 'periodo=todos'
    : new URLSearchParams(
      Object.fromEntries(Object.entries(fetchParams).map(([k, v]) => [k, String(v)]))
    ).toString();
  const pctVinculado = total.n_empenhos
    ? Math.round(((total.n_empenhos_vinculados || 0) / total.n_empenhos) * 100)
    : 0;

  return (
    <main className="page-container">
      <div className="page-hero">
        <h1>Dinheiro público</h1>
        <p className="page-hero-sub">
          Orçamento, empenhos, pagamentos e fornecedores da Prefeitura de Ritápolis — fonte:{' '}
          <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
            {HOST_PORTAL_TRANSPARENCIA}
          </a>
          , cruzado com o acervo de licitações.
        </p>
        <AreaSearchForm
          tipos={TIPOS_DINHEIRO_PUBLICO}
          placeholder="Buscar edital, contrato ou emenda…"
          className="page-hero-search"
        />
      </div>

      <ModulosArea areaId="dinheiro" semCabecalho />

      <section className="panorama" aria-labelledby="panorama-titulo">
        <div className="panorama-cabecalho">
          <div>
            <h2 id="panorama-titulo">Panorama {periodoLabel}</h2>
            <p className="section-note">
              Estes números e o gráfico 'Para onde vai o dinheiro' seguem o período escolhido.
              {ultimaColeta ? ` Última coleta em ${formatDate(ultimaColeta)}.` : null}
            </p>
          </div>
          <PeriodoSelector porMandato={porMandato} periodo={periodo} anosCobertos={periodo.anos_cobertos} modo={modo} />
        </div>
        <MetricasPeriodo total={total} periodoLabel={periodoLabel} pctVinculado={pctVinculado} />
      </section>

      <SectionBlock
        title={`Para onde vai o dinheiro (${periodoLabel})`}
        description="Duas formas de olhar o mesmo gasto: pela finalidade (saúde, educação, obras…) ou pelo tipo de despesa do código orçamentário."
      >
        <AbasDestino
          rotulo="Classificação do gasto"
          abas={[
            {
              id: 'finalidade',
              rotulo: 'Por finalidade',
              conteudo: finalidadesEmpenho?.length ? (
                <FinalidadesResumo bare finalidades={finalidadesEmpenho} periodoLabel={periodoLabel} queryPeriodo={queryPeriodo} />
              ) : null,
            },
            {
              id: 'tipo-despesa',
              rotulo: 'Por tipo de despesa',
              conteudo: gastos?.categorias?.length ? (
                <GastosPorCategoria bare categorias={gastos.categorias} periodoLabel={periodoLabel} queryPeriodo={queryPeriodo} />
              ) : null,
            },
          ]}
        />
      </SectionBlock>

      <IntelligenceBrief resumoAi={destaqueIa} publicacao={ultimaPublicacao} />

      <section className="section-block" aria-labelledby="aprofundar-titulo">
        <div className="section-head">
          <div>
            <h2 id="aprofundar-titulo">Aprofundar</h2>
            <p className="section-note">Tabelas completas. Clique para abrir.</p>
          </div>
        </div>
        <div className="expansivel-lista">
          {fila?.resumo?.n_total ? (
            <Expansivel
              id="fila"
              titulo={fetchParams.exercicio ? `Fila de pagamentos (${fetchParams.exercicio})` : 'Fila de pagamentos — pendentes na última coleta'}
              resumo={[
                `${fila.resumo.n_total.toLocaleString('pt-BR')} empenhos liquidados sem pagamento · ${formatMoney(fila.resumo.valor_total)}`,
                fila.resumo.liquidacao_mais_antiga ? `desde ${String(fila.resumo.liquidacao_mais_antiga).slice(0, 4)}` : null,
              ].filter(Boolean).join(' · ')}
            >
              <FilaPagamentos bare fila={fila} />
            </Expansivel>
          ) : null}
          <Expansivel id="credores" titulo={`Principais credores (${periodoLabel})`} resumo="ranking por valor empenhado">
            <TopCredores bare topCredores={topCredores} periodoLabel={periodoLabel} />
          </Expansivel>
          <Expansivel id="exercicios" titulo={`Por mandato e exercício (${historicoLabel})`} resumo="empenhado, pago e vínculos ano a ano">
            <TabelaExercicios bare porAno={porAno} porMandato={porMandato} />
          </Expansivel>
          <Expansivel id="receita" titulo={`Composição da receita orçamentária (${historicoLabel})`} resumo="de onde vem o dinheiro">
            <ComposicaoReceita bare receitasPorAno={receitasPorAno} porAno={porAno} />
          </Expansivel>
          <Expansivel id="tipos" titulo={`Tipos de empenho (${periodoLabel})`} resumo="ordinário, estimativo, global">
            <TiposEmpenho bare tiposEmpenho={tiposEmpenho} periodoLabel={periodoLabel} />
          </Expansivel>
          <Expansivel id="coleta" titulo="Status da coleta" resumo={ultimaColeta ? `última coleta em ${formatDate(ultimaColeta)}` : 'quando os dados foram atualizados'}>
            <StatusColeta bare logs={logs} />
          </Expansivel>
        </div>
      </section>
    </main>
  );
}
