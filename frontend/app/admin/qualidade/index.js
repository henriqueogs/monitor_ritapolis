import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { fetchAuditoria } from '../../lib/api';

// Mapeados para os tokens do design system Gov.br
const SCORE_TOKENS = {
  green:  { bg: 'var(--success-soft)',  color: 'var(--success)' },
  yellow: { bg: 'var(--warning-soft)',  color: 'var(--warning)' },
  orange: { bg: 'rgba(156,82,4,0.1)',   color: '#9c5204' },
  red:    { bg: 'var(--error-soft)',    color: 'var(--error)' }
};

const BAR_COLORS = {
  green:  'var(--success)',
  yellow: 'var(--warning)',
  orange: '#c76b0a',
  red:    'var(--error)',
  blue:   'var(--accent)'
};

function scoreToken(score) {
  if (score >= 75) return 'green';
  if (score >= 50) return 'yellow';
  if (score >= 26) return 'orange';
  return 'red';
}

function ScoreBar({ value, max = 100, color = 'blue' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-muted)', borderRadius: 4, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: BAR_COLORS[color] || BAR_COLORS.blue,
            borderRadius: 4
          }}
        />
      </div>
      <span style={{ fontSize: 13, minWidth: 36, textAlign: 'right', color: 'var(--text-muted)' }}>{pct}%</span>
    </div>
  );
}

function ScoreBadge({ score }) {
  const { bg, color } = SCORE_TOKENS[scoreToken(score)];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 12,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        background: bg,
        color
      }}
    >
      {score}
    </span>
  );
}

function LacunaBadge({ campo }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        background: 'var(--error-soft)',
        color: 'var(--error)',
        marginRight: 4
      }}
    >
      {campo}
    </span>
  );
}

function tipoLabel(tipo) {
  const map = {
    edital: 'Edital',
    publicacao_extrato: 'Extrato',
    documento_publico: 'Doc. público',
    lei: 'Lei',
    decreto: 'Decreto',
    portaria: 'Portaria',
    resolucao: 'Resolução'
  };
  return map[tipo] || tipo;
}

export default async function AdminQualidadePage() {
  const dados = await fetchAuditoria().catch(() => null);

  if (!dados) {
    return (
      <main className="page-container admin-page">
        <div className="page-title">
          <div>
            <h1>Qualidade dos dados</h1>
            <p>Score de prontidão para inteligência por documento.</p>
          </div>
        </div>
        <SectionBlock title="Erro">
          <p className="empty-state">Não foi possível carregar os dados de auditoria.</p>
        </SectionBlock>
      </main>
    );
  }

  const { visao_geral, por_faixa, lacunas, por_ano, por_tipo, piores } = dados;

  return (
    <main className="page-container admin-page">
      <div className="page-title">
        <div>
          <h1>Qualidade dos dados</h1>
          <p>Score de prontidão para inteligência — texto, resumo IA, data, arquivo, produtos e vencedor.</p>
        </div>
      </div>

      {/* Métricas principais */}
      <SectionBlock title="Visão geral">
        <div className="admin-metric-grid">
          <div className="admin-metric-card">
            <span>Total de documentos</span>
            <strong>{visao_geral.total}</strong>
          </div>
          <div className="admin-metric-card">
            <span>Score médio</span>
            <strong>{visao_geral.score_medio.toFixed(1)} / 100</strong>
          </div>
          <div className="admin-metric-card">
            <span>Prontos (score ≥ 75)</span>
            <strong style={{ color: 'var(--success)' }}>
              {visao_geral.prontos}
              <small style={{ fontWeight: 400, fontSize: 13, marginLeft: 6, color: 'var(--text-muted)' }}>
                ({visao_geral.total > 0 ? ((visao_geral.prontos / visao_geral.total) * 100).toFixed(1) : 0}%)
              </small>
            </strong>
          </div>
          <div className="admin-metric-card">
            <span>Críticos (score ≤ 25)</span>
            <strong style={{ color: 'var(--error)' }}>
              {visao_geral.criticos}
              <small style={{ fontWeight: 400, fontSize: 13, marginLeft: 6, color: 'var(--text-muted)' }}>
                ({visao_geral.total > 0 ? ((visao_geral.criticos / visao_geral.total) * 100).toFixed(1) : 0}%)
              </small>
            </strong>
          </div>
        </div>
      </SectionBlock>

      {/* Distribuição de score — não-clicável */}
      <SectionBlock title="Distribuição de prontidão">
        <div className="quality-list">
          {por_faixa.map((faixa) => {
            const cor = faixa.faixa === '76–100' ? 'green'
              : faixa.faixa === '51–75' ? 'yellow'
              : faixa.faixa === '26–50' ? 'orange'
              : 'red';
            return (
              <div key={faixa.faixa} className="quality-row quality-row-static">
                <div>
                  <strong>{faixa.faixa}</strong>
                  <p>{faixa.total} documento{faixa.total !== 1 ? 's' : ''}</p>
                  <ScoreBar value={faixa.total} max={visao_geral.total} color={cor} />
                </div>
                <span>{faixa.pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </SectionBlock>

      {/* Lacunas por campo — não-clicável */}
      <SectionBlock title="Lacunas por campo">
        <div className="quality-list">
          {lacunas.map((lacuna) => (
            <div key={lacuna.campo} className="quality-row quality-row-static">
              <div>
                <strong>{lacuna.label}</strong>
                <p>
                  {lacuna.ausentes} de {lacuna.aplicaveis} documento{lacuna.aplicaveis !== 1 ? 's' : ''} aplicáveis
                </p>
                <ScoreBar value={lacuna.aplicaveis - lacuna.ausentes} max={lacuna.aplicaveis} color="blue" />
              </div>
              <span
                style={{
                  color: lacuna.pct > 50 ? 'var(--error)' : lacuna.pct > 20 ? 'var(--warning)' : undefined,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {lacuna.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </SectionBlock>

      {/* Score por ano */}
      {por_ano.length > 0 && (
        <SectionBlock title="Score médio por ano">
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 420 }}>
              <div className="table-row table-row-header">
                <span>Ano</span>
                <span>Docs</span>
                <span>Score médio</span>
                <span>Prontos</span>
                <span>Críticos</span>
              </div>
              {por_ano.map((item) => (
                <div key={item.ano || 'sem_ano'} className="table-row">
                  <span>{item.ano || 'Sem ano'}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{item.total}</span>
                  <span><ScoreBadge score={Math.round(item.score_medio)} /></span>
                  <span style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{item.prontos}</span>
                  <span
                    style={{
                      color: item.criticos > 0 ? 'var(--error)' : undefined,
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {item.criticos}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionBlock>
      )}

      {/* Score por tipo */}
      {por_tipo.length > 0 && (
        <SectionBlock title="Score médio por tipo">
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 360 }}>
              <div className="table-row table-row-header">
                <span>Tipo</span>
                <span>Docs</span>
                <span>Score médio</span>
                <span>Prontos</span>
              </div>
              {por_tipo.map((item) => (
                <div key={item.tipo} className="table-row">
                  <span>{tipoLabel(item.tipo)}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{item.total}</span>
                  <span><ScoreBadge score={Math.round(item.score_medio)} /></span>
                  <span style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{item.prontos}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionBlock>
      )}

      {/* Documentos com score mais baixo */}
      {piores.length > 0 && (
        <SectionBlock
          title="Documentos com prontidão mais baixa"
          description="Os documentos com menor score — mostrando o que está faltando em cada um."
        >
          <div className="quality-list">
            {piores.slice(0, 30).map((doc) => {
              const lacunasDoc = [
                !doc.tem_texto && 'sem_texto',
                !doc.tem_resumo_ai && 'sem_resumo_ia',
                !doc.tem_data && 'sem_data',
                !doc.tem_arquivo && 'sem_arquivo',
                doc.e_licitacao && !doc.tem_produtos && 'sem_produtos',
                doc.e_licitacao && !doc.tem_vencedor && 'sem_vencedor'
              ].filter(Boolean);

              return (
                <Link key={doc.id} href={`/documento/${doc.id}`} className="quality-row">
                  <div>
                    <strong>
                      {doc.ano || 'Sem ano'} — {tipoLabel(doc.tipo)} — {doc.titulo?.slice(0, 70)}
                      {doc.titulo?.length > 70 ? '…' : ''}
                    </strong>
                    <p style={{ marginTop: 4 }}>
                      {lacunasDoc.map((l) => (
                        <LacunaBadge key={l} campo={l} />
                      ))}
                    </p>
                  </div>
                  <ScoreBadge score={doc.score} />
                </Link>
              );
            })}
          </div>
        </SectionBlock>
      )}
    </main>
  );
}
