import { formatDate } from '../../../lib/format';

const ETAPAS = [
  {
    chave: 'data_empenho',
    titulo: 'Empenhado',
    explicacao: 'A Prefeitura reservou o dinheiro e assumiu o compromisso de pagar.',
  },
  {
    chave: 'data_liquidacao',
    titulo: 'Liquidado',
    explicacao: 'A Prefeitura conferiu que o produto foi entregue ou o serviço foi prestado.',
  },
  {
    chave: 'data_pagamento',
    titulo: 'Pago',
    explicacao: 'O dinheiro saiu da conta da Prefeitura para o credor.',
  },
];

/**
 * Linha do tempo empenho → liquidação → pagamento, com explicação cidadã de
 * cada etapa. Etapa sem data é mostrada como pendente — lacuna explícita.
 */
export default function LinhaDoTempoPagamento({ empenho }) {
  return (
    <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 0 }}>
      {ETAPAS.map((etapa, i) => {
        const data = empenho[etapa.chave];
        const concluida = Boolean(data);
        return (
          <li key={etapa.chave} style={{ display: 'flex', gap: 14 }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                aria-hidden
                style={{
                  width: 14, height: 14, borderRadius: '50%', marginTop: 4,
                  background: concluida ? 'var(--success)' : 'var(--surface-muted)',
                  border: concluida ? 'none' : '2px solid var(--border)',
                }}
              />
              {i < ETAPAS.length - 1 && (
                <span style={{ width: 2, flex: 1, minHeight: 26, background: 'var(--border)' }} />
              )}
            </span>
            <span style={{ paddingBottom: 16 }}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <strong style={{ fontSize: 14 }}>{etapa.titulo}</strong>
                <span style={{ fontSize: 13, color: concluida ? 'inherit' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {concluida ? formatDate(data) : 'ainda não aconteceu'}
                </span>
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {etapa.explicacao}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
