'use client';

import { useEffect, useState } from 'react';
import { fetchProdutosGruposComparaveis, fetchEvolucaoPrecoGrupo } from '../../lib/api';
import { formatMoney } from '../../lib/format';

function variacaoPct(serie) {
  if (!serie || serie.length < 2) return null;
  const ini = serie[0].preco_medio;
  const fim = serie[serie.length - 1].preco_medio;
  if (!ini) return null;
  return Math.round(((fim - ini) / ini) * 100);
}

function Sparkline({ serie }) {
  if (!serie || serie.length < 2) return null;
  const w = 280;
  const h = 64;
  const precos = serie.map((p) => p.preco_medio);
  const min = Math.min(...precos);
  const max = Math.max(...precos);
  const span = max - min || 1;
  const pts = serie.map((p, i) => {
    const x = (i / (serie.length - 1)) * (w - 8) + 4;
    const y = h - 6 - ((p.preco_medio - min) / span) * (h - 16);
    return [x, y];
  });
  const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block', maxWidth: '100%' }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((pt, i) => (
        <circle key={i} cx={pt[0]} cy={pt[1]} r="3" fill="var(--accent)" />
      ))}
    </svg>
  );
}

export default function EvolucaoPrecos() {
  const [grupos, setGrupos] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetchProdutosGruposComparaveis({ limite: 60 }).then((r) => {
      const dados = r.dados || [];
      setGrupos(dados);
      setCarregando(false);
      if (dados[0]) setSelecionado(dados[0].id);
    });
  }, []);

  useEffect(() => {
    if (selecionado == null) return;
    setDetalhe(null);
    fetchEvolucaoPrecoGrupo(selecionado).then(setDetalhe);
  }, [selecionado]);

  if (carregando) return <p className="empty-state">Carregando comparação de preços…</p>;
  if (grupos.length === 0) return <p className="empty-state">Sem produtos comparáveis ainda.</p>;

  const pct = detalhe ? variacaoPct(detalhe.serie) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 20 }}>
      {/* Lista de produtos comparáveis */}
      <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        {grupos.map((g) => {
          const ativo = g.id === selecionado;
          return (
            <button
              key={g.id}
              onClick={() => setSelecionado(g.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--border)',
                background: ativo ? 'var(--accent-soft)' : 'transparent',
                color: ativo ? 'var(--accent)' : 'inherit',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: ativo ? 600 : 500, display: 'block', textTransform: 'capitalize' }}>
                {g.rotulo_canonico.slice(0, 48)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {g.n_anos} anos · {formatMoney(g.preco_min)}–{formatMoney(g.preco_max)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detalhe do produto selecionado */}
      <div>
        {!detalhe ? (
          <p className="empty-state">Selecione um produto.</p>
        ) : (
          <>
            <h3 style={{ margin: '0 0 2px', fontSize: 16, textTransform: 'capitalize' }}>{detalhe.rotulo_canonico}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              {detalhe.variacoes.length} variação{detalhe.variacoes.length !== 1 ? 'ões' : ''} de descrição agrupada{detalhe.variacoes.length !== 1 ? 's' : ''}
              {pct !== null && (
                <span style={{ marginLeft: 8, fontWeight: 700, color: pct > 0 ? 'var(--error)' : 'var(--success)' }}>
                  {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% no período
                </span>
              )}
            </p>
            <Sparkline serie={detalhe.serie} />
            <div className="simple-table" style={{ marginTop: 12 }}>
              <div className="table-row table-row-header">
                <span>Ano</span>
                <span>Preço médio</span>
                <span>Faixa</span>
                <span>Itens</span>
              </div>
              {detalhe.serie.map((s) => (
                <div key={s.ano} className="table-row">
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.ano}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(s.preco_medio)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(s.preco_min)}–{formatMoney(s.preco_max)}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.n_itens}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
