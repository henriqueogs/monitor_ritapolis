import Link from 'next/link';
import { fetchCamaraProjetoDossie } from '../../../../lib/api';
import SectionBlock from '../../../../components/SectionBlock';
import CamaraSubnav from '../../../../components/CamaraSubnav';
import BreadcrumbJsonLd from '../../../../components/BreadcrumbJsonLd';

export async function generateStaticParams() {
  return [];
}

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

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const projeto = await fetchCamaraProjetoDossie(params.id);
  if (!projeto) return { title: 'Projeto não encontrado' };
  return { title: `${tipoLabel(projeto.tipo)} nº ${projeto.numero}/${projeto.exercicio} — Câmara Municipal` };
}

export default async function ProjetoDetalhePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const projeto = await fetchCamaraProjetoDossie(params.id);

  if (!projeto) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/legislacao/camara/projetos" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Projetos em tramitação</Link>
          <h1>Projeto não encontrado</h1>
          <p>Este projeto não existe na base coletada da Câmara Municipal.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Legislação Municipal', url: '/legislacao' },
          { name: 'Projetos em tramitação', url: '/legislacao/camara/projetos' },
          { name: `${tipoLabel(projeto.tipo)} nº ${projeto.numero}/${projeto.exercicio}`, url: `/legislacao/camara/projetos/${projeto.int_prjt}` },
        ]}
      />
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
          <Link href="/legislacao/camara/projetos" style={{ color: 'var(--text-muted)' }}>← Projetos em tramitação</Link>
        </p>
        <h1>{tipoLabel(projeto.tipo)} nº {projeto.numero}/{projeto.exercicio}</h1>
        <p style={{ margin: '4px 0 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="availability-badge is-real">{projeto.situacao}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{projeto.localizacao}</span>
        </p>
      </div>

      <CamaraSubnav />

      <SectionBlock
        title="Ementa"
        description={projeto.autor_texto ? `Autor(es): ${projeto.autor_texto}` : 'Autoria não informada pela fonte.'}
      >
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>{projeto.ementa || 'Ementa não publicada pela fonte.'}</p>
      </SectionBlock>

      <SectionBlock title="Fonte oficial" description="Documento e origem, direto da Câmara Municipal.">
        <dl className="keyvalue-list">
          <div className="keyvalue-row">
            <dt>Situação</dt>
            <dd>{projeto.situacao || '—'}</dd>
          </div>
          <div className="keyvalue-row">
            <dt>Localização (estágio)</dt>
            <dd>{projeto.localizacao || '—'}</dd>
          </div>
          {projeto.anexo_url && (
            <div className="keyvalue-row">
              <dt>PDF oficial</dt>
              <dd>
                <a href={projeto.anexo_url} target="_blank" rel="noopener noreferrer">
                  ↗ {projeto.anexo_nome || 'Abrir PDF'}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </SectionBlock>
    </main>
  );
}
