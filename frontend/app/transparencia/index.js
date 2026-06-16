import Link from 'next/link';
import SectionBlock from '../components/SectionBlock';
import OrigemBadge from '../components/OrigemBadge';
import EvolucaoPrecos from '../inteligencia/components/EvolucaoPrecos';
import { fetchTransparenciaResumo } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';

export const metadata = {
  title: 'Dinheiro público — Monitor Ritápolis',
  description:
    'Orçamento, empenhos, pagamentos, fornecedores e evolução de preços da Prefeitura de Ritápolis.'
};

const PORTAL_URL = 'https://pt.ritapolis.mg.gov.br/Tempo_Real_Despesa';
const CNPJ_PREFEITURA = '18557553000105';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(part, total) {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="admin-metric-card">
      <span>{label}</span>
      <strong style={accent ? { color: `var(${accent})` } : undefined}>{value ?? '—'}</strong>
      {sub ? <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.55 }}>{sub}</p> : null}
    </div>
  );
}

function StatusColeta({ logs }) {
  if (!logs?.length) {
    return <p className="empty-state">Nenhum log de coleta disponível.</p>;
  }
  return (
    <dl className="keyvalue-list">
      {logs.map((log) => (
        <div key={log.exercicio} className="keyvalue-row">
          <dt>Exercício {log.exercicio}</dt>
          <dd>
            <span
              className={`availability-badge ${
                log.status === 'ok'
                  ? 'is-real'
                  : log.status === 'erro_parcial'
                  ? 'is-parcial'
                  : 'is-pendente'
              }`}
            >
              {log.status === 'ok'
                ? 'Completo'
                : log.status === 'erro_parcial'
                ? `Parcial — ${log.erro}`
                : log.status}
            </span>
            <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {log.registros?.toLocaleString('pt-BR')} registros · coletado em{' '}
              {formatDate(log.coletado_em)}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default async function TransparenciaPage() {
  const dados = await fetchTransparenciaResumo();

  if (!dados) {
    return (
      <main className="page-container">
        <div className="page-hero">
          <h1>Dinheiro público</h1>
          <p className="page-hero-sub">Dados do Portal da Transparência indisponíveis no momento.</p>
        </div>
      </main>
    );
  }

  const { total, porAno, topCredores, ultimosEmpenhos, logs, tiposEmpenho, receitasPorAno } = dados;
  const pctVinculado = total.n_empenhos
    ? Math.round((total.n_licitacoes_vinculadas / total.n_empenhos) * 100)
    : 0;

  // Intervalo de tempo explícito para todo valor somado (princípio: nunca somar
  // sem indicar o período coberto).
  const anosEmpenho = (porAno || []).map((r) => Number(r.ano)).filter(Boolean);
  const periodoLabel = anosEmpenho.length
    ? `${Math.min(...anosEmpenho)}–${Math.max(...anosEmpenho)}`
    : 'período coletado';

  // Filtrar autorreferências (CNPJ da própria Prefeitura aparece em transferências internas)
  const credoresFiltrados = (topCredores || []).filter(
    (c) => c.credor_cnpj !== CNPJ_PREFEITURA
  );

  const portalAside = (
    <a
      href={PORTAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="availability-badge is-gov"
    >
      Ver no Portal ↗
    </a>
  );

  return (
    <main className="page-container">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="page-hero">
        <h1>Dinheiro público</h1>
        <p className="page-hero-sub">
          Orçamento, empenhos, pagamentos, fornecedores e evolução de preços da Prefeitura de
          Ritápolis — fonte:{' '}
          <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
            pt.ritapolis.mg.gov.br
          </a>
          , cruzado com o acervo de licitações.{' '}
          <Link href="/inteligencia">Ver inteligência completa →</Link>
        </p>
      </div>

      {/* ── Métricas gerais ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 32
        }}
      >
        <MetricCard
          label={`Total empenhado (${periodoLabel})`}
          value={formatMoney(total.valor_total)}
          sub={`soma dos exercícios ${periodoLabel}`}
          accent="--accent"
        />
        <MetricCard
          label="Empenhos"
          value={total.n_empenhos?.toLocaleString('pt-BR')}
          sub="EO + EG + EE + OP"
        />
        <MetricCard
          label="Credores únicos"
          value={total.n_credores?.toLocaleString('pt-BR')}
          sub="por CNPJ"
        />
        <MetricCard
          label="Vinculados a licitações"
          value={`${total.n_licitacoes_vinculadas?.toLocaleString('pt-BR')} doc.`}
          sub={`${pctVinculado}% dos empenhos com processo`}
          accent={pctVinculado > 50 ? '--success' : '--warning'}
        />
      </div>

      {/* ── Evolução de preços por produto (3.3) ──────────────────────────── */}
      <SectionBlock
        title="Evolução de preços por produto"
        description="Mesmo item comprado em anos diferentes, agrupado por similaridade (IA). Mostra como o preço unitário pago variou ao longo do tempo — o que nenhum portal oficial oferece."
      >
        <EvolucaoPrecos />
      </SectionBlock>

      {/* ── Por exercício ─────────────────────────────────────────────────── */}
      <SectionBlock
        title="Por exercício orçamentário"
        description="Valor empenhado vs. orçamento de receita previsto. A receita prevista é o orçamento aprovado pela Câmara (LOA). Valor empenhado ≠ valor pago."
        aside={portalAside}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Exercício</th>
              <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Receita prevista (LOA)</th>
              <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Despesa executada</th>
              <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>% execução</th>
              <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Empenhos</th>
              <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Vinculados</th>
            </tr>
          </thead>
          <tbody>
            {(porAno || []).map((row) => {
              const execucao = row.valor_receita_previsto && row.valor_total
                ? Math.round((row.valor_total / row.valor_receita_previsto) * 100)
                : null;
              return (
                <tr key={row.exercicio} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 8px', fontWeight: 600 }}>
                    <a
                      href={`${PORTAL_URL}?exercicio=${row.exercicio}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      {row.exercicio} ↗
                    </a>
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {row.valor_receita_previsto != null ? formatMoney(row.valor_receita_previsto) : '—'}
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 600 }}>
                    {formatMoney(row.valor_total)}
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                    {execucao != null ? (
                      <span
                        style={{
                          color: execucao > 95 ? 'var(--warning)' : execucao > 70 ? 'var(--success)' : 'var(--text-secondary)',
                          fontWeight: 600,
                        }}
                      >
                        {execucao}%
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {row.n_empenhos?.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                    <span title={`${row.n_empenhos_vinculados} empenhos em ${row.n_vinculados} licitações`}>
                      {pct(row.n_empenhos_vinculados, row.n_empenhos)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionBlock>

      {/* ── Composição da receita ─────────────────────────────────────────── */}
      {receitasPorAno?.length > 0 && (
        <SectionBlock
          title="Composição da receita orçamentária"
          description="Receitas correntes (impostos, taxas, transferências federais/estaduais) e receitas de capital (alienações, transferências de capital). Fonte: LOA aprovada pela Câmara Municipal."
        >
          <dl className="keyvalue-list">
            {(receitasPorAno || []).map((r) => {
              const despeRow = (porAno || []).find((d) => d.exercicio === r.exercicio);
              const execucao = despeRow?.valor_total && r.valor_total_previsto
                ? Math.round((despeRow.valor_total / r.valor_total_previsto) * 100)
                : null;
              return (
                <div key={r.exercicio} className="keyvalue-row">
                  <dt style={{ fontWeight: 600 }}>{r.exercicio}</dt>
                  <dd>
                    <strong>{formatMoney(r.valor_total_previsto)}</strong>
                    <span style={{ marginLeft: 12, color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                      receita prevista
                    </span>
                    {despeRow?.valor_total != null && (
                      <span style={{ marginLeft: 12, color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                        · {formatMoney(despeRow.valor_total)} empenhado
                        {execucao != null && (
                          <span
                            style={{
                              marginLeft: 6,
                              color: execucao > 95 ? 'var(--warning)' : 'var(--success)',
                              fontWeight: 600,
                            }}
                          >
                            ({execucao}%)
                          </span>
                        )}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            * Receita prevista = orçamento aprovado (LOA). Despesa executada = empenhos registrados no Portal
            da Transparência. Ano de 2023 pode estar incompleto caso o período inicial de coleta não cubra
            todo o exercício.
          </p>
        </SectionBlock>
      )}

      {/* ── Top credores ──────────────────────────────────────────────────── */}
      <SectionBlock
        title="Principais credores"
        description="Ordenado por valor total empenhado. Exclui registros sem CNPJ e a própria Prefeitura (transferências internas)."
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>#</th>
              <th style={{ padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Credor</th>
              <th style={{ padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>CNPJ</th>
              <th style={{ padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Empenhos</th>
              <th style={{ padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Valor total</th>
              <th style={{ padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>Exercícios</th>
            </tr>
          </thead>
          <tbody>
            {credoresFiltrados.slice(0, 15).map((c, i) => (
              <tr key={c.credor_cnpj} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {i + 1}
                </td>
                <td style={{ padding: '10px 6px', fontWeight: 500 }}>
                  {c.credor_nome || '—'}
                </td>
                <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <a
                    href={`https://www.receita.fazenda.gov.br/pessoajuridica/cnpj/cnpjreva/cnpjrevaFE.asp?cnpj=${c.credor_cnpj}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Verificar CNPJ na Receita Federal"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {c.credor_cnpj} ↗
                  </a>
                </td>
                <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {c.n_empenhos?.toLocaleString('pt-BR')}
                </td>
                <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600 }}>
                  {formatMoney(c.valor_total)}
                </td>
                <td style={{ padding: '10px 6px', color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                  {c.primeiro_exercicio === c.ultimo_exercicio
                    ? c.primeiro_exercicio
                    : `${c.primeiro_exercicio}–${c.ultimo_exercicio}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionBlock>

      {/* ── Empenhos recentes ─────────────────────────────────────────────── */}
      <SectionBlock
        title="Empenhos recentes"
        description="Últimos 20 empenhos por data de empenho. Empenhos com vínculo têm processo licitatório identificado."
        aside={
          <Link
            href="/acervo?tipo=edital"
            className="availability-badge is-gov"
            style={{ textDecoration: 'none' }}
          >
            Ver licitações
          </Link>
        }
      >
        <div className="products-table">
          {(ultimosEmpenhos || []).map((emp) => (
            <article key={emp.id} className="product-row">
              <div className="product-row-main">
                <div className="document-row-meta">
                  <span>{emp.exercicio_orcamento}</span>
                  <span>Empenho {emp.empenho}</span>
                  {emp.tipo ? <span style={{ fontSize: '0.8rem' }}>{emp.tipo.split(' - ')[0]}</span> : null}
                  <a
                    href={`${PORTAL_URL}?exercicio=${emp.exercicio_orcamento}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="availability-badge is-gov"
                    title="Verificar no Portal da Transparência"
                  >
                    ↗ Verificar
                  </a>
                </div>
                <h3 style={{ margin: '4px 0', fontSize: '1rem' }}>
                  {emp.credor_nome || 'Credor não identificado'}
                </h3>
                {emp.historico ? (
                  <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    {emp.historico}
                  </p>
                ) : null}
                {emp.documento_titulo ? (
                  <Link
                    href={`/documento/${emp.documento_id}`}
                    style={{ fontSize: '0.83rem', color: 'var(--accent)' }}
                  >
                    {emp.documento_titulo.slice(0, 80)}{emp.documento_titulo.length > 80 ? '…' : ''}
                  </Link>
                ) : (
                  <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                    Sem processo vinculado
                  </span>
                )}
              </div>
              <div className="product-row-side">
                <div className="document-row-field">
                  <span>Valor</span>
                  <strong>{formatMoney(emp.valor)}</strong>
                </div>
                <div className="document-row-field">
                  <span>Data</span>
                  <strong>{formatDate(emp.data_empenho) || '—'}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionBlock>

      {/* ── Tipos de empenho ──────────────────────────────────────────────── */}
      <SectionBlock
        title="Composição por tipo de empenho"
        description="EO = Ordinário (contrato definido). EG = Global (estimativa anual). EE = Estimativo. OP = Ordem de Pagamento."
      >
        <dl className="keyvalue-list">
          {(tiposEmpenho || []).map((t) => (
            <div key={t.tipo} className="keyvalue-row">
              <dt style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{t.tipo || 'Sem tipo'}</dt>
              <dd>
                <strong>{formatMoney(t.valor)}</strong>
                <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                  {t.n?.toLocaleString('pt-BR')} empenhos ·{' '}
                  {pct(t.valor, dados.total.valor_total)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </SectionBlock>

      {/* ── Status da coleta ─────────────────────────────────────────────── */}
      <SectionBlock
        title="Status da coleta"
        description="Dados coletados via API pública do Portal da Transparência (SH3 Informática). Atualização automática diária."
      >
        <StatusColeta logs={logs} />
        <p style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Fonte:{' '}
          <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
            pt.ritapolis.mg.gov.br/Tempo_Real_Despesa
          </a>{' '}
          — Sistema SH3 Informática, API pública, sem autenticação.
        </p>
      </SectionBlock>
    </main>
  );
}
