import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import DocumentPreview from './DocumentPreview';

export default function UpdatesSection({ documentos, anoPadrao }) {
  return (
    <div className="content-stack">
      <SectionBlock
        title="Publicado recentemente"
        description="O que a Prefeitura publicou por último — editais, contratos, decretos e mais, do mais novo ao mais antigo."
        aside={
          <Link href={`/acervo${anoPadrao ? `?ano=${anoPadrao}` : ''}`}>
            Abrir acervo &rarr;
          </Link>
        }
      >
        <div className="citizen-list">
          {documentos.length ? (
            documentos.map((documento) => (
              <DocumentPreview key={documento.id} documento={documento} />
            ))
          ) : (
            <p className="empty-state">Nenhuma atualizacao encontrada.</p>
          )}
        </div>
      </SectionBlock>
    </div>
  );
}
