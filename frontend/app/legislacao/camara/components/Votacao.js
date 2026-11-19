import Link from 'next/link';

const RESULTADO_LABEL = {
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  retirado: 'Retirado de pauta',
  adiado: 'Adiado',
  outro: 'Outro desfecho',
};
const VOTO_LABEL = { favoravel: 'A favor', contrario: 'Contra', abstencao: 'Abstenção' };
const CORES = { favoravel: 'var(--accent)', contrario: '#c2410c', abstencao: 'var(--text-muted)' };

export function formatarData(iso) {
  if (!iso) {return 'data não identificada';}
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Aviso obrigatório em toda tela que mostra presença ou voto tirado das atas. */
export function AvisoExtracao() {
  return (
    <p
      role="note"
      style={{
        fontSize: 13, lineHeight: 1.5, padding: '10px 14px', margin: '0 0 20px',
        borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-muted)',
      }}
    >
      Presenças e votos foram lidos das atas oficiais por inteligência artificial e conferidos
      automaticamente contra o texto, sem revisão humana. <strong>Podem conter erros.</strong>{' '}
      Cada registro traz o trecho e o link da ata: confira antes de usar.{' '}
      <Link href="/sobre">Encontrou um erro? Avise.</Link>
    </p>
  );
}

function Barra({ partes }) {
  const total = partes.reduce((soma, parte) => soma + parte.valor, 0);
  if (total === 0) {return null;}
  return (
    <div
      role="img"
      aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join(', ')}
      style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2, margin: '8px 0' }}
    >
      {partes.filter((p) => p.valor > 0).map((p) => (
        <span key={p.rotulo} style={{ flex: p.valor, background: p.cor }} />
      ))}
    </div>
  );
}

function Nominais({ nominais }) {
  if (!nominais?.length) {
    return (
      <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--text-muted)' }}>
        A ata registra só o placar, sem dizer como cada vereador votou.
      </p>
    );
  }
  return Object.keys(VOTO_LABEL).map((voto) => {
    const nomes = nominais.filter((n) => n.voto === voto).map((n) => n.nome);
    if (nomes.length === 0) {return null;}
    return (
      <p key={voto} style={{ margin: '4px 0', fontSize: 13 }}>
        <strong style={{ color: CORES[voto] }}>{VOTO_LABEL[voto]}:</strong> {nomes.join(', ')}
      </p>
    );
  });
}

/** Uma votação: resultado, placar em barra, votos nominais, trecho da ata e link da origem. */
export default function Votacao({ votacao, mostrarSessao = false }) {
  const partes = [
    { rotulo: 'A favor', valor: votacao.votos_favoraveis || 0, cor: CORES.favoravel },
    { rotulo: 'Contra', valor: votacao.votos_contrarios || 0, cor: CORES.contrario },
    { rotulo: 'Abstenção', valor: votacao.abstencoes || 0, cor: CORES.abstencao },
  ];
  const temPlacar = partes.some((p) => p.valor > 0);

  return (
    <article style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 14 }}>{votacao.materia}</strong>
        <span className="availability-badge is-real">{RESULTADO_LABEL[votacao.resultado] || votacao.resultado}</span>
        {mostrarSessao && (
          <Link href={`/legislacao/camara/sessoes/${votacao.documento_id}`} style={{ fontSize: 12 }}>
            sessão de {formatarData(votacao.data_sessao)}
          </Link>
        )}
      </div>
      <Barra partes={partes} />
      <p style={{ margin: '4px 0', fontSize: 13 }}>
        {temPlacar
          ? partes.filter((p) => p.valor > 0).map((p) => `${p.valor} ${p.rotulo.toLowerCase()}`).join(' · ')
          : 'A ata não informa o número de votos.'}
      </p>
      <Nominais nominais={votacao.nominais} />
      <blockquote
        style={{
          margin: '8px 0 0', padding: '6px 12px', borderLeft: '3px solid var(--border)',
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        Trecho da ata: “{votacao.trecho}”{' '}
        {votacao.url_pdf ? (
          <a href={votacao.url_pdf} target="_blank" rel="noopener noreferrer">Abrir a ata (PDF) ↗</a>
        ) : (
          <a href={votacao.url_origem} target="_blank" rel="noopener noreferrer">
            Listagem oficial da Câmara ↗ (a ata não tem arquivo próprio)
          </a>
        )}
      </blockquote>
    </article>
  );
}
