import Link from 'next/link';
import { fetchInteligenciaFinanceira } from '../../lib/api';
import ConcentracaoCredores from '../components/ConcentracaoCredores';
import AnomaliasEmpenhos from '../components/AnomaliasEmpenhos';
import EvolucaoFuncoes from '../components/EvolucaoFuncoes';
import RankingFuncoes from '../components/RankingFuncoes';

export const metadata = {
  title: 'Análise financeira',
  description: 'Concentração de fornecedores, empenhos atípicos, evolução de gastos e ranking por área de governo de Ritápolis/MG.',
};

export default async function AnaliseFinanceiraPage({ searchParams }) {
  const exercicio = searchParams?.exercicio ? Number(searchParams.exercicio) : undefined;
  const dados = await fetchInteligenciaFinanceira(exercicio).catch(() => null);

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Análise financeira</h1>
          <p>
            Inteligência sobre os empenhos executados — concentração de mercado, valores atípicos,
            evolução por área de governo e ranking de fornecedores.{' '}
            <Link href="/transparencia" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Ver dados brutos →
            </Link>
          </p>
        </div>

        {/* Seletor de exercício — anos derivados dos dados reais */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(dados?.anos_disponiveis || []).map((ano) => (
            <Link
              key={ano}
              href={`/inteligencia/financeira?exercicio=${ano}`}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                background: dados?.exercicio === ano ? 'var(--accent)' : 'var(--surface-muted)',
                color: dados?.exercicio === ano ? '#fff' : 'inherit',
                textDecoration: 'none',
              }}
            >
              {ano}
            </Link>
          ))}
        </div>
      </div>

      {!dados && (
        <div style={{ padding: '32px 0', color: 'var(--text-muted)', textAlign: 'center' }}>
          Não foi possível carregar os dados de análise financeira.
        </div>
      )}

      {dados && (
        <>
          <ConcentracaoCredores
            dados={dados.concentracao}
            historico={dados.concentracao_historico}
          />
          <AnomaliasEmpenhos dados={dados.anomalias} />
          <EvolucaoFuncoes dados={dados.evolucao} />
          <RankingFuncoes dados={dados.ranking_por_funcao} />
        </>
      )}
    </main>
  );
}
