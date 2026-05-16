import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { fetchEstatisticas } from '../../lib/api';

export default async function AdminQualidadePage() {
  const data = await fetchEstatisticas();
  const qualidade = data.qualidade_dados || {};

  return (
    <main className="page-container admin-page">
      <div className="page-title">
        <div>
          <h1>Qualidade dos dados</h1>
          <p>Lacunas tecnicas que precisam ser revisadas para melhorar a confiabilidade publica.</p>
        </div>
      </div>
      <SectionBlock title="Alertas operacionais">
        <div className="quality-list">
          <Link href="/documentos?qualidade=sem_pdf" className="quality-row">
            <div><strong>Sem arquivo vinculado</strong><p>Registros com fonte, mas sem arquivo oficial associado.</p></div>
            <span>{qualidade.sem_pdf || 0}</span>
          </Link>
          <Link href="/documentos?qualidade=erro_pdf" className="quality-row">
            <div><strong>Arquivo com falha</strong><p>Documentos em que a leitura do arquivo falhou.</p></div>
            <span>{qualidade.erro_pdf || 0}</span>
          </Link>
          <Link href="/documentos?qualidade=sem_data" className="quality-row">
            <div><strong>Sem data identificada</strong><p>Itens sem data de publicacao confiavel.</p></div>
            <span>{qualidade.sem_data || 0}</span>
          </Link>
        </div>
      </SectionBlock>
    </main>
  );
}
