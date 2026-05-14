import Link from 'next/link';
import AnimatedChartPanel from '../components/AnimatedChartPanel';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import SectionBlock from '../components/SectionBlock';
import { fetchAnalisesResumos, fetchEstatisticas } from '../lib/api';
import { labelTipo } from '../lib/format';

const temasPlanejados = [
  {
    nome: 'Educacao',
    termos: 'merenda, transporte escolar, uniforme, escola',
    status: 'parcial'
  },
  {
    nome: 'Saude',
    termos: 'medicamentos, atendimento, unidade de saude',
    status: 'pendente'
  },
  {
    nome: 'Obras',
    termos: 'obra, reforma, pavimentacao, manutencao',
    status: 'pendente'
  },
  {
    nome: 'Licitacoes',
    termos: 'editais, pregoes, dispensas e compras publicas',
    status: 'real',
    href: '/licitacoes'
  },
  {
    nome: 'Camara',
    termos: 'leis, atas, portarias e atos legislativos',
    status: 'real',
    href: '/documentos?fonte=camara'
  }
];

export default async function TemasPage() {
  const [estatisticas, analises] = await Promise.all([
    fetchEstatisticas(),
    fetchAnalisesResumos({ limite: 8 }).catch(() => ({ itens: [] }))
  ]);
  const tipos = estatisticas.por_tipo || [];
  const tipoChart = tipos.slice(0, 6).map((item) => ({
    label: item.tipo_nome || labelTipo(item.tipo),
    value: item.total,
    valueLabel: `${item.total}`
  }));

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Temas publicos</h1>
          <p>
            Uma ponte entre documentos oficiais e assuntos que as pessoas procuram. Alguns temas ja usam dados reais;
            outros dependem de classificacao e novas integracoes.
          </p>
        </div>
        <DataAvailabilityBadge status="parcial" />
      </div>

      <section className="topic-hero">
        <div>
          <h2>Comece por assunto, aprofunde por evidencias</h2>
          <p>
            Os temas ainda nao sao uma classificacao oficial completa. Eles funcionam como portas de entrada para
            explorar documentos, leituras de IA e lacunas conhecidas.
          </p>
        </div>
        <Link href="/analises" className="button button-primary">Ver analises</Link>
      </section>

      <div className="content-grid">
        <AnimatedChartPanel
          title="Atos por natureza"
          description="Enquanto os temas consolidados nao existem, a natureza documental ajuda a navegar."
          items={tipoChart}
        />

        <SectionBlock title="Analises recentes conectaveis a temas">
          <div className="simple-table">
            {analises.itens?.length ? (
              analises.itens.slice(0, 6).map((item) => (
                <Link key={item.documento_id} href={`/documento/${item.documento_id}`} className="table-row table-row-stacked">
                  <div>
                    <strong>{item.titulo_curto || item.numero || item.titulo}</strong>
                    <p>{item.objeto || item.resumo_cidadao || 'Resumo disponivel no detalhe.'}</p>
                  </div>
                  <span>{item.tipo_nome || labelTipo(item.tipo)}</span>
                </Link>
              ))
            ) : (
              <p className="empty-state">As analises aparecem aqui conforme os resumos IA forem gerados.</p>
            )}
          </div>
        </SectionBlock>
      </div>

      <SectionBlock
        title="Temas de navegacao"
        description="Sem mock: quando a classificacao ainda nao existe, o tema aparece como pendente ou parcial."
      >
        <div className="topic-grid">
          {temasPlanejados.map((tema) => (
            <Link key={tema.nome} href={tema.href || `/documentos?q=${encodeURIComponent(tema.termos.split(',')[0])}`} className="topic-card">
              <div className="topic-card-head">
                <h2>{tema.nome}</h2>
                <DataAvailabilityBadge status={tema.status} />
              </div>
              <p>{tema.termos}</p>
            </Link>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock title="O que falta para temas consolidados">
        <div className="status-list">
          <div className="status-row">
            <div>
              <strong>Classificador tematico revisavel</strong>
              <p>Necessario para afirmar que um documento pertence a Educacao, Saude ou Obras sem depender apenas de busca textual.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
          <div className="status-row">
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
