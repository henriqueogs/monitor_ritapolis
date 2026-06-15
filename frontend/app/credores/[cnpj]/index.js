import Link from 'next/link';
import { fetchCredorProfile } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import SectionBlock from '../../components/SectionBlock';

export async function generateMetadata({ params }) {
  const perfil = await fetchCredorProfile(params.cnpj).catch(() => null);
  return {
    title: perfil ? `${perfil.nome} — Fornecedor — Monitor Ritápolis` : 'Fornecedor — Monitor Ritápolis',
  };
}

function CrescimentoBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0;
  const color = up ? (pct > 40 ? 'var(--error)' : 'var(--warning)') : 'var(--success)';
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, color,
      background: 'color-mix(in srgb, currentColor 12%, transparent)',
      padding: '3px 10px', borderRadius: 10, marginLeft: 8,
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% vs ano anterior
    </span>
  );
}

function formatCnpj(cnpj) {
  const c = String(cnpj).replace(/\D/g, '');
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export default async function CredorProfilePage({ params }) {
  const perfil = await fetchCredorProfile(params.cnpj).catch(() => null);

  if (!perfil) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/credores" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Fornecedores</Link>
          <h1>Fornecedor não encontrado</h1>
          <p>CNPJ {formatCnpj(params.cnpj)} não possui empenhos registrados.</p>
        </div>
      </main>
    );
  }

  const { nome, cnpj, resumo, por_ano, por_funcao, empenhos_recentes, licitacoes_ganhas } = perfil;
  const totalMax = Math.max(...(por_ano || []).map((r) => r.valor_total), 1);

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
            <Link href="/credores" style={{ color: 'var(--text-muted)' }}>← Fornecedores</Link>
          </p>
          <h1 style={{ wordBreak: 'break-word' }}>{nome}</h1>
          <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 14, color: 'var(--text-muted)' }}>
            CNPJ {formatCnpj(cnpj)}
          </p>
        </div>
        <CrescimentoBadge pct={resumo.crescimento_yoy} />
      </div>

      {/* Métricas */}
      <div className="admin-metric-grid" style={{ marginBottom: 24 }}>
        <div className="admin-metric-card">
          <span>Total recebido</span>
          <strong>{formatMoney(resumo.valor_total)}</strong>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>
            {resumo.primeiro_ano}–{resumo.ultimo_ano}
          </p>
        </div>
        <div className="admin-metric-card">
          <span>Empenhos</span>
          <strong>{resumo.n_empenhos}</strong>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>{resumo.n_anos} ano{resumo.n_anos !== 1 ? 's' : ''}</p>
        </div>
        <div className="admin-metric-card">
          <span>Áreas atendidas</span>
          <strong>{resumo.n_funcoes}</strong>
        </div>
        {licitacoes_ganhas?.length > 0 && (
          <div className="admin-metric-card">
            <span>Licitações ganhas</span>
            <strong style={{ color: 'var(--success)' }}>{licitacoes_ganhas.length}</strong>
          </div>
        )}
      </div>

      {/* Licitado vs Pago — só quando há licitação vinculada */}
      {resumo.total_licitado > 0 && (
        <SectionBlock
          title="Licitado vs. pago"
          description="Valor homologado nas licitações vencidas comparado ao total efetivamente pago via empenhos. Diferenças são normais — pagamentos cobrem vários anos e contratos, e nem todo valor licitado é integralmente executado."
        >
          {(() => {
            const max = Math.max(resumo.total_licitado, resumo.total_pago, 1);
            const Linha = ({ rotulo, valor, cor, sub }) => (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{rotulo}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', color: cor }}>{formatMoney(valor)}</strong>
                </div>
                <div style={{ height: 10, background: 'var(--surface-muted)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((valor / max) * 100)}%`, height: '100%', background: cor, borderRadius: 5 }} />
                </div>
                {sub && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{sub}</p>}
              </div>
            );
            return (
              <>
                <Linha
                  rotulo="Licitado (homologado)"
                  valor={resumo.total_licitado}
                  cor="var(--accent)"
                  sub={`${resumo.n_licitacoes_vencidas} licitação${resumo.n_licitacoes_vencidas !== 1 ? 'ões' : ''} vencida${resumo.n_licitacoes_vencidas !== 1 ? 's' : ''}`}
                />
                <Linha
                  rotulo="Pago (empenhos)"
                  valor={resumo.total_pago}
                  cor="var(--success)"
                  sub={`${resumo.n_empenhos} empenhos em ${resumo.n_anos} ano${resumo.n_anos !== 1 ? 's' : ''}`}
                />
              </>
            );
          })()}
        </SectionBlock>
      )}

      {/* Histórico por ano */}
      {por_ano?.length > 0 && (
        <SectionBlock title="Histórico de recebimentos">
          {por_ano.map((r) => {
            const pct = Math.round((r.valor_total / totalMax) * 100);
            return (
              <div key={r.ano} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{r.ano}</span>
                  <span style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{r.n_empenhos} empenhos</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.valor_total)}</strong>
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </SectionBlock>
      )}

      {/* Por área funcional */}
      {por_funcao?.length > 0 && (
        <SectionBlock title="Recebimentos por área de governo">
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 400 }}>
              <div className="table-row table-row-header">
                <span>Área</span>
                <span>Empenhos</span>
                <span>Total</span>
              </div>
              {por_funcao.map((f) => (
                <div key={f.funcao} className="table-row">
                  <span style={{ fontSize: 13 }}>{f.funcao}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{f.n_empenhos}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(f.valor_total)}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionBlock>
      )}

      {/* Licitações ganhas */}
      {licitacoes_ganhas?.length > 0 && (
        <SectionBlock title="Licitações vencidas">
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 500 }}>
              <div className="table-row table-row-header">
                <span>Ano</span>
                <span>Processo</span>
                <span>Modalidade</span>
                <span>Valor final</span>
              </div>
              {licitacoes_ganhas.map((l) => (
                <Link
                  key={l.documento_id}
                  href={`/documento/${l.documento_id}`}
                  className="table-row"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ fontSize: 13 }}>{l.ano}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                      {l.titulo}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.numero}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.modalidade || '—'}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {l.valor_final ? formatMoney(l.valor_final) : '—'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </SectionBlock>
      )}

      {/* Empenhos recentes */}
      {empenhos_recentes?.length > 0 && (
        <SectionBlock title="Empenhos recentes">
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 520 }}>
              <div className="table-row table-row-header">
                <span>Data</span>
                <span>Empenho</span>
                <span>Área</span>
                <span>Valor</span>
              </div>
              {empenhos_recentes.map((e) => (
                <div key={`${e.empenho}-${e.ano}`} className="table-row">
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {e.data_empenho || e.ano}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{e.empenho}</span>
                    {e.historico && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                        {e.historico}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {e.funcao?.replace(/^\d+\s*-\s*/, '') || '—'}
                  </span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(e.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionBlock>
      )}
    </main>
  );
}
