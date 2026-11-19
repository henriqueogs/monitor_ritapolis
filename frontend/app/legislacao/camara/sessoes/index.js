import Link from 'next/link';
import { fetchCamaraSessoes } from '../../../lib/api';
import SectionBlock from '../../../components/SectionBlock';
import CamaraSubnav from '../../../components/CamaraSubnav';
import { AvisoExtracao, formatarData } from '../components/Votacao';

export const metadata = {
  title: 'Sessões e votações — Câmara Municipal',
  description: 'Quem estava presente e o que foi votado em cada sessão da Câmara de Ritápolis/MG, segundo as atas.',
};

const TIPO_LABEL = { ata_ordinaria: 'Ordinária', ata_extraordinaria: 'Extraordinária' };

export default async function SessoesPage() {
  const { sessoes, cobertura } = await fetchCamaraSessoes();
  const anos = sessoes.map((s) => s.data_sessao?.slice(0, 4)).filter(Boolean);
  const [maisAntigo, maisRecente] = [anos[anos.length - 1], anos[0]];
  const periodo = anos.length && (maisAntigo === maisRecente ? maisRecente : `${maisAntigo}–${maisRecente}`);

  return (
    <main className="page-container">
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/legislacao" style={{ color: 'var(--text-muted)' }}>← Legislação Municipal</Link>
        </p>
        <h1>Sessões e votações</h1>
        <p>Presença e resultado de cada votação, lidos das atas publicadas pela Câmara.</p>
      </div>

      <CamaraSubnav />
      <AvisoExtracao />

      <SectionBlock
        title={periodo ? `${sessoes.length} sessões (${periodo})` : 'Sessões'}
        description={
          cobertura
            ? `${cobertura.sessoes_publicadas} de ${cobertura.atas_com_texto} atas com texto já lidas; última sessão em ${formatarData(cobertura.ultima_sessao)}. Ordem: data da sessão, da mais recente à mais antiga.`
            : 'Ordem: data da sessão, da mais recente à mais antiga.'
        }
      >
        {sessoes.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhuma ata lida até agora.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sessoes.map((s) => (
              <li key={s.documento_id} style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <Link href={`/legislacao/camara/sessoes/${s.documento_id}`} style={{ fontWeight: 700, fontSize: 14 }}>
                  {formatarData(s.data_sessao)} · {TIPO_LABEL[s.tipo] || 'Sessão'} nº {s.numero}/{s.ano}
                </Link>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {s.presentes} presentes · {s.votacoes} {s.votacoes === 1 ? 'votação' : 'votações'}
                  {s.presidente ? ` · presidida por ${s.presidente}` : ''}
                  {' · '}
                  <a href={s.url_pdf || s.url_origem} target="_blank" rel="noopener noreferrer">
                    {s.url_pdf ? 'ata (PDF) ↗' : 'listagem oficial ↗'}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionBlock>
    </main>
  );
}
