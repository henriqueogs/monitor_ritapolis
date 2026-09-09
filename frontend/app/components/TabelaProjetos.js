import Link from 'next/link';

const TIPO_LABELS = {
  projeto_lei: 'Projeto de Lei',
  projeto_lei_complementar: 'Projeto de Lei Complementar',
  projeto_lei_substitutivo: 'Projeto de Lei Substitutivo',
  projeto_resolucao: 'Projeto de Resolução',
  projeto_emenda_lei_organica: 'Projeto de Emenda à Lei Orgânica',
};

function tipoLabel(tipo) {
  return TIPO_LABELS[tipo] || 'Projeto';
}

function LinhaProjeto({ item }) {
  return (
    <div className="table-row" style={{ display: 'grid', gridTemplateColumns: '1fr 150px 130px', gap: 12, alignItems: 'start', padding: '10px 0' }}>
      <span style={{ minWidth: 0 }}>
        <Link
          href={`/legislacao/camara/projetos/${item.int_prjt}`}
          style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'inherit' }}
        >
          {tipoLabel(item.tipo)} nº {item.numero}/{item.exercicio}
        </Link>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {item.ementa || 'Sem ementa publicada.'}
        </span>
        {item.autor_texto && (
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Autor: {item.autor_texto}
          </span>
        )}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.situacao || '—'}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{item.localizacao || '—'}</span>
    </div>
  );
}

/**
 * Tabela de projetos de lei em tramitação na Câmara. Sem valor monetário
 * (não é despesa) -- §11.1 não se aplica aqui.
 */
export default function TabelaProjetos({ dados }) {
  if (!dados?.length) {
    return <p style={{ color: 'var(--text-muted)' }}>Nenhum projeto encontrado com esses filtros.</p>;
  }
  return (
    <div className="table-scroll-x">
      <div className="simple-table" style={{ minWidth: 640 }}>
        <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '1fr 150px 130px', gap: 12 }}>
          <span>Projeto</span>
          <span>Situação</span>
          <span style={{ textAlign: 'right' }}>Localização</span>
        </div>
        {dados.map((item) => (
          <LinhaProjeto key={item.int_prjt} item={item} />
        ))}
      </div>
    </div>
  );
}
