import Link from 'next/link';
import SectionBlock from '../components/SectionBlock';
import CategoriaBadge from '../components/CategoriaBadge';
import { fetchInteligenciaPanorama, fetchCoberturaPorAno } from '../lib/api';
import { formatMoney } from '../lib/format';
import FornecedoresRanking from '../estatisticas/components/FornecedoresRanking';

export const metadata = {
  title: 'Inteligência pública — Monitor Ritápolis',
  description: 'Visão cruzada de contratos, fornecedores e categorias de Ritápolis/MG.'
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, colorVar }) {
  return (
    <div className="admin-metric-card">
      <span>{label}</span>
      <strong style={colorVar ? { color: `var(${colorVar})` } : undefined}>{value}</strong>
      {sub ? <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.55 }}>{sub}</p> : null}
    </div>
  );
}

function AlertaRow({ label, valor, descricao, critical }) {
  if (!valor) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        padding: '12px 0',
        borderBottom: '1px solid var(--border)'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{label}</p>
        {descricao && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{descricao}</p>}
      </div>
      <span
        style={{
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          fontVariantNumeric: 'tabular-nums',
          color: critical ? 'var(--error)' : 'var(--warning)',
          minWidth: 50,
          textAlign: 'right',
          flexShrink: 0
        }}
      >
        {valor}
      </span>
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

// Célula de % com cor proporcional à completude — verde alto, vermelho baixo
function CoberturaCell({ pct }) {
  const cor = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <span style={{ flex: 1, height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden', maxWidth: 80 }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: cor }} />
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right', color: cor, fontWeight: 600, fontSize: 13 }}>
        {pct}%
      </span>
    </span>
  );
}

export default async function InteligenciaPage() {
  const [panorama, cobertura] = await Promise.all([
    fetchInteligenciaPanorama().catch(() => null),
    fetchCoberturaPorAno().catch(() => ({ dados: [] })),
  ]);

  if (!panorama) {
    return (
      <main className="page-container">
        <div className="page-title">
          <h1>Inteligência pública</h1>
          <p>Não foi possível carregar os dados.</p>
        </div>
      </main>
    );
  }

  const { resumo, alertas, por_ano, por_categoria } = panorama;
  const valorTotal = (resumo.valor_vencedor_identificado || 0) + (resumo.valor_produtos_identificado || 0);
  const totalMaxCategoria = Math.max(...(por_categoria || []).map((c) => c.total), 1);

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Inteligência pública</h1>
          <p>Visão cruzada de contratos, fornecedores e categorias — construída a partir dos documentos oficiais de Ritápolis.</p>
        </div>
      </div>

      {/* ── Panorama ── */}
      <SectionBlock title="Panorama geral">
        <div className="admin-metric-grid">
          <MetricCard
            label="Licitações catalogadas"
            value={resumo.total_licitacoes}
          />
          <MetricCard
            label="Valor identificado"
            value={formatMoney(valorTotal)}
            sub="contratos homologados + itens com preço"
          />
          <MetricCard
            label="Fornecedores identificados"
            value={resumo.n_fornecedores}
          />
          <MetricCard
            label="Com vencedor registrado"
            value={resumo.com_vencedor}
            sub={`de ${resumo.total_licitacoes} licitações`}
            colorVar={resumo.com_vencedor > 0 ? '--success' : undefined}
          />
        </div>
      </SectionBlock>

      {/* ── Categorias ── */}
      {por_categoria?.length > 0 && (
        <SectionBlock
          title="Gastos por categoria"
          description="Classificação por palavras-chave. Clique para filtrar licitações."
        >
          {/* Cabeçalho — hidden em mobile, visível em desktop */}
          <div
            className="categoria-table-head"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: '0 14px',
              padding: '0 0 8px',
              borderBottom: '1px solid var(--border)',
              marginBottom: 4
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Categoria</span>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'right' }}>Editais</span>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'right', minWidth: 90 }}>Valor final</span>
          </div>

          {por_categoria.map((c) => {
            const pct = totalMaxCategoria > 0 ? Math.round((c.total / totalMaxCategoria) * 100) : 0;
            return (
              <Link
                key={c.categoria}
                href={`/licitacoes?categoria=${encodeURIComponent(c.categoria)}`}
                title={`Ver licitações de ${c.categoria}`}
                className="quality-row"
              >
                <div>
                  <CategoriaBadge categoria={c.categoria} />
                  <div
                    style={{
                      marginTop: 8,
                      height: 4,
                      background: 'var(--surface-muted)',
                      borderRadius: 2,
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--accent)',
                        borderRadius: 2
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.total}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.valor_final_total > 0 ? formatMoney(c.valor_final_total) : '—'}
                  </span>
                </div>
              </Link>
            );
          })}

          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Valor final disponível apenas para licitações com vencedor registrado. A cobertura é parcial.
          </p>
        </SectionBlock>
      )}

      {/* ── Link para análise financeira ── */}
      <SectionBlock
        title="Análise financeira (B1–B4)"
        description="Concentração de fornecedores, empenhos atípicos, evolução de gastos e ranking por área — baseados nos empenhos executados."
        aside={
          <Link
            href="/inteligencia/financeira"
            style={{
              display: 'inline-block',
              padding: '6px 16px',
              borderRadius: 6,
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Ver análise →
          </Link>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
          Análise inteligente sobre os {' '}
          <strong>empenhos reais</strong> da Prefeitura: índice HHI de concentração de mercado,
          detecção de valores atípicos com z-score, evolução 2023–2026 por área funcional e
          ranking dos principais fornecedores por secretaria.
        </p>
      </SectionBlock>

      {/* ── Fornecedores ── */}
      <SectionBlock
        title="Ranking de fornecedores"
        description="Top 10 por valor total identificado (contratos homologados e produtos com preço)."
        aside={<Link href="/transparencia" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ver transparência →</Link>}
      >
        <FornecedoresRanking />
      </SectionBlock>

      {/* ── Por ano ── */}
      {por_ano?.length > 0 && (
        <SectionBlock title="Licitações por ano">
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 480 }}>
              <div className="table-row table-row-header">
                <span>Ano</span>
                <span>Licitações</span>
                <span>Com vencedor</span>
                <span>Valor estimado</span>
                <span>Valor final</span>
              </div>
              {por_ano.map((item) => (
                <div key={item.ano} className="table-row">
                  <span>
                    <Link href={`/licitacoes?ano=${item.ano}`} style={{ color: 'inherit' }}>
                      {item.ano}
                    </Link>
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{item.total_licitacoes}</span>
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: item.com_vencedor > 0 ? 'var(--success)' : undefined
                    }}
                  >
                    {item.com_vencedor}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {item.valor_estimado_total > 0 ? formatMoney(item.valor_estimado_total) : '—'}
                  </span>
                  <span
                    style={{
                      fontWeight: item.valor_final_total > 0 ? 600 : 400,
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {item.valor_final_total > 0 ? formatMoney(item.valor_final_total) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionBlock>
      )}

      {/* ── Cobertura honesta por ano (4.4) ── */}
      {cobertura?.dados?.length > 0 && (
        <SectionBlock
          title="Cobertura dos dados por ano"
          description="Quanto de cada ano já foi efetivamente lido e cruzado. Os anos mais antigos têm menos resultado registrado na fonte — a plataforma mostra a lacuna em vez de escondê-la."
        >
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 560 }}>
              <div className="table-row table-row-header">
                <span>Ano</span>
                <span>Editais</span>
                <span style={{ textAlign: 'right' }}>Com vencedor</span>
                <span style={{ textAlign: 'right' }}>Com valor</span>
                <span style={{ textAlign: 'right' }}>Com resumo</span>
                <span style={{ textAlign: 'right' }}>Com análise</span>
              </div>
              {cobertura.dados.map((r) => (
                <div key={r.ano} className="table-row">
                  <span style={{ fontWeight: 500 }}>{r.ano}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.total}</span>
                  <span><CoberturaCell pct={r.vencedor_pct} /></span>
                  <span><CoberturaCell pct={r.valor_pct} /></span>
                  <span><CoberturaCell pct={r.resumo_pct} /></span>
                  <span><CoberturaCell pct={r.analise_pct} /></span>
                </div>
              ))}
            </div>
          </div>
        </SectionBlock>
      )}

      {/* ── Alertas de lacuna ── */}
      {(alertas.sem_vencedor > 0 || alertas.sem_cnpj_vencedor > 0 || alertas.sem_valor_vencedor > 0) && (
        <SectionBlock
          title="Alertas de lacuna"
          description="Campos ausentes que limitam a profundidade da análise."
        >
          <AlertaRow
            label="Licitações sem vencedor registrado"
            valor={alertas.sem_vencedor}
            descricao="A maioria é de anos anteriores onde a leitura integrada ainda não foi feita."
            critical={alertas.sem_vencedor > 100}
          />
          <AlertaRow
            label="Vencedores sem CNPJ"
            valor={alertas.sem_cnpj_vencedor}
            descricao="Fornecedor identificado mas sem CNPJ vinculado — impede o perfil de empresa."
          />
          <AlertaRow
            label="Contratos sem valor final"
            valor={alertas.sem_valor_vencedor}
            descricao="Homologados mas sem valor registrado — dado ausente na fonte."
          />
        </SectionBlock>
      )}
    </main>
  );
}
