'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

const TIPO_LABEL = { indicacao: 'Indicação', requerimento: 'Requerimento' };
const TODOS = 'todos';

function Chip({ ativo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      style={{
        minHeight: 34,
        padding: '6px 14px',
        borderRadius: 'var(--radius-pill)',
        border: `1px solid ${ativo ? 'var(--accent)' : 'var(--border)'}`,
        background: ativo ? 'var(--accent-soft)' : 'var(--surface)',
        color: ativo ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function formatarData(iso) {
  if (!iso) {return 'sem data';}
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function Proposicao({ item }) {
  return (
    <li style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 14 }}>
          {TIPO_LABEL[item.tipo] || item.tipo} nº {item.numero}/{item.ano}
        </strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatarData(item.data_publicacao)}</span>
      </div>
      <p style={{ margin: '6px 0', fontSize: 14, lineHeight: 1.5 }}>{item.ementa}</p>
      {item.coautores.length > 0 && (
        <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)' }}>
          Com {item.coautores.join(', ')}
        </p>
      )}
      <p style={{ margin: 0, fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Link href={`/documento/${item.id}`}>Ver no acervo</Link>
        {item.url_pdf && (
          <a href={item.url_pdf} target="_blank" rel="noopener noreferrer">PDF na Câmara ↗</a>
        )}
        <a href={item.url_origem} target="_blank" rel="noopener noreferrer">Listagem oficial ↗</a>
      </p>
    </li>
  );
}

/** Lista as proposições de um parlamentar com filtro por ano, tipo e texto. */
export default function ProposicoesExplorer({ proposicoes, porAno }) {
  const [ano, setAno] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return proposicoes.filter(
      (p) =>
        (ano === TODOS || p.ano === ano) &&
        (tipo === TODOS || p.tipo === tipo) &&
        (!termo || String(p.ementa || '').toLowerCase().includes(termo))
    );
  }, [proposicoes, ano, tipo, busca]);

  const maiorAno = Math.max(1, ...porAno.map((l) => l.total));

  return (
    <div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 18 }} aria-label="Proposições por ano">
        {porAno.map((linha) => (
          <button
            key={linha.ano}
            type="button"
            onClick={() => setAno(ano === linha.ano ? TODOS : linha.ano)}
            aria-pressed={ano === linha.ano}
            style={{
              display: 'grid', gridTemplateColumns: '48px 1fr 150px', gap: 10, alignItems: 'center',
              padding: '4px 0', border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
              color: 'inherit', opacity: ano === TODOS || ano === linha.ano ? 1 : 0.45,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>{linha.ano}</span>
            <span style={{ height: 10, borderRadius: 5, background: 'var(--surface-muted)', overflow: 'hidden' }}>
              <span
                style={{
                  display: 'block', height: '100%', borderRadius: 5, background: 'var(--accent)',
                  width: `${(linha.total / maiorAno) * 100}%`,
                }}
              />
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {linha.indicacao} indic. · {linha.requerimento} requer.
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <Chip ativo={tipo === TODOS} onClick={() => setTipo(TODOS)}>Tudo</Chip>
        <Chip ativo={tipo === 'indicacao'} onClick={() => setTipo('indicacao')}>Indicações</Chip>
        <Chip ativo={tipo === 'requerimento'} onClick={() => setTipo('requerimento')}>Requerimentos</Chip>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no pedido (ex.: estrada, saúde)"
          aria-label="Buscar nas proposições"
          style={{
            flex: '1 1 220px', minHeight: 34, padding: '6px 12px', fontSize: 13,
            borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'inherit',
          }}
        />
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0' }} aria-live="polite">
        {visiveis.length} de {proposicoes.length}
        {ano !== TODOS ? ` · ${ano}` : ''}
      </p>

      {visiveis.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Nada encontrado com esse filtro.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {visiveis.map((item) => <Proposicao key={item.id} item={item} />)}
        </ul>
      )}
    </div>
  );
}
