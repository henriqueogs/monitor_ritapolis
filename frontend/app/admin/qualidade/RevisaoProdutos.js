'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchProdutosRevisao,
  fetchProdutosRevisaoResumo,
  setProdutoRevisaoStatus,
  validarProdutosEmLote,
} from '../../lib/api';

const FAIXA_LABEL = { alta: 'Alta (≥ 0,8)', media: 'Média (0,5–0,8)', baixa: 'Baixa (< 0,5)', sem_confianca: 'Sem confiança' };
const FAIXA_COR = { alta: 'var(--success)', media: 'var(--warning)', baixa: 'var(--error)', sem_confianca: 'var(--text-muted)' };

function confiancaCor(c) {
  if (c == null) return 'var(--text-muted)';
  if (c >= 0.8) return 'var(--success)';
  if (c >= 0.5) return 'var(--warning)';
  return 'var(--error)';
}

function fmtConf(c) {
  return c == null ? '—' : `${Math.round(c * 100)}%`;
}

function fmtMoeda(v) {
  if (v == null) return null;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RevisaoProdutos() {
  const [resumo, setResumo] = useState(null);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [soSuspeitos, setSoSuspeitos] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmId, setAcaoEmId] = useState(null);
  const [loteCarregando, setLoteCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const params = { limite: 50 };
    if (soSuspeitos) params.confiancaMax = 0.5;
    const [r, fila] = await Promise.all([fetchProdutosRevisaoResumo(), fetchProdutosRevisao(params)]);
    setResumo(r);
    setItens(fila.itens || []);
    setTotal(fila.total || 0);
    setCarregando(false);
  }, [soSuspeitos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const revisar = async (id, status) => {
    setAcaoEmId(id);
    try {
      await setProdutoRevisaoStatus(id, status);
      setItens((prev) => prev.filter((x) => x.id !== id));
      setTotal((t) => Math.max(t - 1, 0));
      fetchProdutosRevisaoResumo().then(setResumo);
    } finally {
      setAcaoEmId(null);
    }
  };

  const validarLote = async () => {
    setLoteCarregando(true);
    try {
      await validarProdutosEmLote({ confiancaMin: 0.8 });
      await carregar();
    } finally {
      setLoteCarregando(false);
    }
  };

  const pendentes = resumo?.por_status?.find((s) => s.status === 'pendente')?.n || 0;
  const validados = resumo?.por_status?.find((s) => s.status === 'validado')?.n || 0;
  const rejeitados = resumo?.por_status?.find((s) => s.status === 'rejeitado')?.n || 0;
  const altaPendente = resumo?.por_confianca_pendente?.find((f) => f.faixa === 'alta')?.n || 0;

  return (
    <div>
      {/* Resumo */}
      <div className="admin-metric-grid" style={{ marginBottom: 16 }}>
        <div className="admin-metric-card">
          <span>Pendentes</span>
          <strong style={{ color: 'var(--warning)' }}>{pendentes.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Validados</span>
          <strong style={{ color: 'var(--success)' }}>{validados.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Rejeitados</span>
          <strong style={{ color: 'var(--error)' }}>{rejeitados.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      {/* Distribuição de confiança dos pendentes */}
      {resumo?.por_confianca_pendente?.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {resumo.por_confianca_pendente.map((f) => (
            <span
              key={f.faixa}
              style={{
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-muted)',
                color: FAIXA_COR[f.faixa],
                fontWeight: 600,
              }}
            >
              {FAIXA_LABEL[f.faixa] || f.faixa}: {f.n.toLocaleString('pt-BR')}
            </span>
          ))}
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={soSuspeitos} onChange={(e) => setSoSuspeitos(e.target.checked)} />
          Mostrar só suspeitos (confiança &lt; 50%)
        </label>
        <button
          onClick={validarLote}
          disabled={loteCarregando || altaPendente === 0}
          style={{
            fontSize: 13,
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--success)',
            background: 'var(--success-soft)',
            color: 'var(--success)',
            cursor: altaPendente === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {loteCarregando ? 'Validando…' : `Validar ${altaPendente.toLocaleString('pt-BR')} de alta confiança`}
        </button>
      </div>

      {/* Fila */}
      {carregando ? (
        <p className="empty-state">Carregando fila de revisão…</p>
      ) : itens.length === 0 ? (
        <p className="empty-state">Nenhum produto pendente neste filtro. 🎉</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            Exibindo {itens.length} de {total.toLocaleString('pt-BR')} pendentes (menos confiáveis primeiro).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {itens.map((it) => (
              <div
                key={it.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-muted)',
                        color: confiancaCor(it.confianca),
                      }}
                    >
                      {fmtConf(it.confianca)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {it.documento_numero || `doc #${it.documento_id}`}
                      {it.documento_ano ? `/${it.documento_ano}` : ''} · {it.origem}
                    </span>
                  </div>
                  <strong style={{ fontSize: 14, display: 'block' }}>{it.descricao}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {[it.quantidade != null ? `Qtd: ${it.quantidade}` : null, it.unidade, fmtMoeda(it.valor_total_final), it.fornecedor_nome]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {it.trecho_fonte && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>Ver trecho da fonte</summary>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>
                        “…{it.trecho_fonte}…”
                      </p>
                    </details>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={() => revisar(it.id, 'validado')}
                    disabled={acaoEmId === it.id}
                    style={btnStyle('var(--success)', 'var(--success-soft)')}
                  >
                    ✓ Validar
                  </button>
                  <button
                    onClick={() => revisar(it.id, 'rejeitado')}
                    disabled={acaoEmId === it.id}
                    style={btnStyle('var(--error)', 'var(--error-soft)')}
                  >
                    ✕ Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function btnStyle(color, bg) {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 12px',
    borderRadius: 'var(--radius-sm)',
    border: `1px solid ${color}`,
    background: bg,
    color,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
