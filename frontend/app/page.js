import Link from 'next/link';
import AnimatedChartPanel from './components/AnimatedChartPanel';
import IntelligenceBrief from './components/IntelligenceBrief';
import QualitySignals from './components/QualitySignals';
import SectionBlock from './components/SectionBlock';
import StatusBadge from './components/StatusBadge';
import { fetchAnalisesResumos, fetchPainelCidadao } from './lib/api';
import { bestResumo, formatDate, formatMoney, labelFonte, labelTipo } from './lib/format';

function DocumentPreview({ documento }) {
  return (
    <Link href={`/documento/${documento.id}`} className="citizen-row">
      <div className="citizen-row-main">
        <div className="document-row-meta">
          <span>{documento.tipo_nome || labelTipo(documento.tipo)}</span>
          <span>{documento.fonte_nome || labelFonte(documento.fonte)}</span>
          <span>{formatDate(documento.data_publicacao || documento.atualizado_em, 'Sem data')}</span>
        </div>
        <strong>{documento.titulo}</strong>
        <p>{bestResumo(documento)}</p>
        <QualitySignals documento={documento} compact />
      </div>
      <div className="citizen-row-side">
        {documento.numero ? <span>N. {documento.numero}</span> : <span>Sem numero</span>}
        <StatusBadge value={documento.status_coleta} />
      </div>
    </Link>
  );
}

function LicitacaoPreview({ item }) {
  const objeto = item.dados_extras?.licitacao?.objeto || item.resumo || 'Objeto ainda nao identificado.';

  return (
    <Link href={`/documento/${item.id}`} className="citizen-row">
      <div className="citizen-row-main">
        <div className="document-row-meta">
          <span>{item.licitacao_detalhes?.modalidade || 'Edital'}</span>
          <span>{item.fonte_nome || labelFonte(item.fonte)}</span>
          <span>Abertura: {formatDate(item.data_abertura, 'Nao identificada')}</span>
        </div>
        <strong>{item.numero || item.titulo}</strong>
        <p>{objeto}</p>
        <QualitySignals documento={item} compact />
      </div>
      <div className="citizen-row-side">
        <span>{formatMoney(item.valor_estimado)}</span>
        <StatusBadge value={item.licitacao_detalhes?.status || item.status_coleta} />
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const [painel, analises] = await Promise.all([
    fetchPainelCidadao(),
    fetchAnalisesResumos({ limite: 6 }).catch(() => ({ itens: [], por_tipo: [], totais: {} }))
  ]);
  const resumo = painel.resumo || {};
  const analisesItens = analises.itens || [];
  const destaqueIa = analisesItens[0]
    ? {
        ...analisesItens[0],
        id: analisesItens[0].documento_id,
        resumo: analisesItens[0].objeto || analisesItens[0].resumo_cidadao,
        titulo: analisesItens[0].titulo_curto || analisesItens[0].titulo
      }
    : null;
  const ultimaPublicacao = painel.publicacoes_recentes?.[0] || null;
  const licitacaoDestaque = painel.licitacoes_recentes?.find((item) => Number(item.valor_estimado) > 0) || painel.licitacoes_recentes?.[0] || null;
  const atividadePorAno = (painel.anos || [])
    .slice(0, 8)
    .reverse()
    .map((item) => ({
      label: String(item.ano),
      value: item.total,
      valueLabel: `${item.total} atos`
    }));
  const temasPorTipo = (painel.qualidade_por_tipo || [])
    .slice(0, 6)
    .map((item) => ({
      label: item.tipo_nome || labelTipo(item.tipo),
      value: item.total,
      valueLabel: `${item.total}`
    }));
  const comprasComValor = (painel.licitacoes_recentes || [])
    .filter((item) => Number(item.valor_estimado) > 0)
    .slice(0, 5)
    .map((item) => ({
      label: item.numero || item.titulo?.slice(0, 28) || 'Compra publica',
      value: Number(item.valor_estimado || 0),
      valueLabel: formatMoney(item.valor_estimado)
    }));

  return (
    <main className="page-container page-observatory">
      <IntelligenceBrief resumoAi={destaqueIa} publicacao={ultimaPublicacao} licitacao={licitacaoDestaque} />

      <section className="observatory-grid">
        <div className="editorial-feed">
          <div className="feed-head">
            <h2>Leituras recentes da plataforma</h2>
            <Link href="/analises">Explorar evidencias</Link>
          </div>
          {analisesItens.length ? (
            analisesItens.slice(0, 4).map((item) => (
              <Link key={item.documento_id} href={`/documento/${item.documento_id}`} className="editorial-card">
                <span>{item.tipo_nome || labelTipo(item.tipo)} · {item.fonte_nome || labelFonte(item.fonte)}</span>
                <h3>{item.titulo_curto || item.numero || item.titulo}</h3>
                <p>{item.objeto || item.resumo_cidadao || 'Leitura disponivel no detalhe do documento.'}</p>
              </Link>
            ))
          ) : (
            <div className="editorial-card">
              <span>IA em preparacao</span>
              <h3>As leituras aparecem conforme os resumos reais forem gerados</h3>
              <p>Nenhuma analise demonstrativa sera exibida como dado publico confiavel.</p>
            </div>
          )}
        </div>

        <AnimatedChartPanel
          title="Ritmo de publicacoes"
          description="Atos publicados por ano na base local. Use como sinal de atividade, nao como ranking definitivo."
          items={atividadePorAno}
          footnote="Fonte: documentos ja coletados da Prefeitura e da Camara."
        />
      </section>

      <section className="observatory-grid observatory-grid-secondary">
        <AnimatedChartPanel
          title="Onde a atividade aparece"
          description="Distribuicao por tipo documental. A classificacao tematica profunda ainda sera criada."
          items={temasPorTipo}
        />
        <AnimatedChartPanel
          title="Compras recentes com valor identificado"
          description="Valores estimados aparecem apenas quando foram extraidos da fonte atual."
          items={comprasComValor}
          footnote="Vencedor, valor final e contratos dependem de PNCP/transparencia."
        />
      </section>

      <div className="content-grid">
        <SectionBlock
          title="Publicacoes recentes"
          description="Caminhos para conferir atos e documentos oficiais."
          aside={<Link href={`/documentos${resumo.ano_padrao ? `?ano=${resumo.ano_padrao}` : ''}`}>Ver ano</Link>}
        >
          <div className="citizen-list">
            {painel.publicacoes_recentes?.length ? (
              painel.publicacoes_recentes.map((documento) => (
                <DocumentPreview key={documento.id} documento={documento} />
              ))
            ) : (
              <p className="empty-state">Nenhuma publicacao encontrada.</p>
            )}
          </div>
        </SectionBlock>

        <SectionBlock
          title="Compras publicas em acompanhamento"
          description="A plataforma mostra o que foi extraido; conclusoes financeiras amplas dependem das proximas integracoes."
          aside={<Link href={`/licitacoes${resumo.ano_padrao ? `?ano=${resumo.ano_padrao}` : ''}`}>Ver licitacoes</Link>}
        >
          <div className="citizen-list">
            {painel.licitacoes_recentes?.length ? (
              painel.licitacoes_recentes.map((item) => <LicitacaoPreview key={item.id} item={item} />)
            ) : (
              <p className="empty-state">Nenhuma licitacao encontrada.</p>
            )}
          </div>
        </SectionBlock>
      </div>

      <div className="content-grid">
        <SectionBlock title="Limites atuais da leitura publica">
          <div className="status-list">
            <div className="status-row">
              <div>
                <strong>Fornecedor, vencedor e valor final</strong>
                <p>Essas informacoes entram quando PNCP e portal de transparencia forem integrados.</p>
              </div>
              <StatusBadge value="revisar" />
            </div>
            <div className="status-row">
              <div>
                <strong>Temas consolidados</strong>
                <p>Hoje a exploracao por tema usa busca e tipo documental; a classificacao revisavel ainda sera criada.</p>
              </div>
              <StatusBadge value="revisar" />
            </div>
          </div>
        </SectionBlock>

        <SectionBlock title="Fontes usadas nesta versao">
          <div className="simple-table">
            {painel.fontes?.length ? (
              painel.fontes.map((fonte) => (
                <Link key={fonte.fonte} href={`/documentos?fonte=${fonte.fonte}`} className="table-row">
                  <span>{fonte.fonte_nome || labelFonte(fonte.fonte)}</span>
                  <strong>ver fonte</strong>
                </Link>
              ))
            ) : (
              <p className="empty-state">Nenhuma fonte coletada.</p>
            )}
          </div>
        </SectionBlock>
      </div>
    </main>
  );
}
