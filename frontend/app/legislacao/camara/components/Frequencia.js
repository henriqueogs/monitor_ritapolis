import Link from 'next/link';
import { formatarData } from './Votacao';

// "Ausência" cobre tanto a falta registrada quanto a sessão em que o nome não consta na
// ata: rótulo neutro, que não afirma o motivo (pode ser falta, licença ou ata que só lista
// os presentes). A API mantém os dois separados (`ausente`, `nao_listado`).
const PARTES = [
  { rotulo: 'presente', cor: 'var(--accent)', valor: (l) => l.presente },
  { rotulo: 'ausência justificada', cor: '#d97706', valor: (l) => l.ausente_justificada },
  { rotulo: 'ausência', cor: 'var(--border)', valor: (l) => l.ausente + l.nao_listado },
];
const SITUACAO_LABEL = {
  presente: 'presente',
  ausente_justificada: 'ausência justificada',
  ausente: 'ausência (registrada na ata)',
  nao_listado: 'ausência (nome não consta na ata)',
};

function Sessoes({ detalhe }) {
  return (
    <details style={{ fontSize: 12, marginTop: 4 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Ver as {detalhe.length} sessões e as atas</summary>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
        {detalhe.map((s) => (
          <li key={s.documento_id}>
            <Link href={`/legislacao/camara/sessoes/${s.documento_id}`}>{formatarData(s.data_sessao)}</Link>
            {' — '}
            {SITUACAO_LABEL[s.situacao] || s.situacao}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Uma barra por ano: de quantas sessões com ata a pessoa participou, com as sessões ao lado. */
export default function Frequencia({ linhas }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {linhas.map((linha) => {
        const partes = PARTES.map((p) => ({ ...p, n: p.valor(linha) })).filter((p) => p.n > 0);
        return (
          <div key={linha.ano}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
              <span>
                <strong>{linha.ano}</strong>
                {linha.mandato && (
                  <span style={{ color: 'var(--text-muted)' }}> · mandato {linha.mandato.inicio}–{linha.mandato.fim}</span>
                )}
              </span>
              <span>
                presente em <strong>{linha.presente}</strong> de {linha.sessoes} sessões
              </span>
            </div>
            <div
              role="img"
              aria-label={partes.map((p) => `${p.rotulo}: ${p.n}`).join(', ')}
              style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2, margin: '6px 0' }}
            >
              {partes.map((p) => (
                <span key={p.rotulo} style={{ flex: p.n, background: p.cor }} />
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {partes.map((p) => `${p.n} ${p.rotulo}`).join(' · ')}
              {linha.ausente + linha.nao_listado > 0 && ' (falta registrada ou nome que não consta na ata)'}
            </span>
            {linha.detalhe?.length > 0 && <Sessoes detalhe={linha.detalhe} />}
          </div>
        );
      })}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        “Ausência” reúne as sessões em que a ata registra a falta e as em que o nome não aparece
        na ata — que pode listar só os presentes, ou o vereador pode estar licenciado. O primeiro e
        o último ano de cada mandato podem estar incompletos. A ata de cada sessão é a referência.
      </p>
    </div>
  );
}
