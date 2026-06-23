'use client';

import { useState } from 'react';
import { apiUrl } from '../../lib/api';

export default function NarrativaAnomalias({ exercicio }) {
  const [narrativa, setNarrativa] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  async function gerarNarrativa() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`${apiUrl}/inteligencia/anomalias/narrativa?exercicio=${exercicio}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setNarrativa(data.narrativa);
    } catch (e) {
      setErro('Não foi possível gerar a narrativa. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (narrativa) {
    return (
      <div style={{
        padding: '16px 20px',
        borderRadius: 8,
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
        marginBottom: 20,
      }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>
          📊 Análise IA — {exercicio}
        </p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{narrativa}</p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={gerarNarrativa}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--surface)', fontSize: 13, fontWeight: 500, cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? '⏳ Gerando…' : '✨ Gerar análise IA deste exercício'}
      </button>
      {erro && <p style={{ marginTop: 8, fontSize: 13, color: 'var(--error)' }}>{erro}</p>}
    </div>
  );
}
