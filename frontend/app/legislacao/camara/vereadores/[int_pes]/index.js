import Link from 'next/link';
import { fetchCamaraVereadorDossie } from '../../../../lib/api';
import SectionBlock from '../../../../components/SectionBlock';
import CamaraSubnav from '../../../../components/CamaraSubnav';
import BreadcrumbJsonLd from '../../../../components/BreadcrumbJsonLd';
import ProposicoesExplorer from '../../components/ProposicoesExplorer';
import Votacao, { AvisoExtracao } from '../../components/Votacao';
import Frequencia from '../../components/Frequencia';

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const vereador = await fetchCamaraVereadorDossie(params.int_pes);
  return { title: vereador ? `${vereador.nome} — Vereador` : 'Vereador não encontrado' };
}

function intervaloDeDatas(datas) {
  const anos = datas.filter(Boolean).map((d) => d.slice(0, 4)).sort();
  if (!anos.length) {return null;}
  return anos[0] === anos[anos.length - 1] ? anos[0] : `${anos[0]}–${anos[anos.length - 1]}`;
}

function Numero({ valor, rotulo }) {
  return (
    <div className="admin-metric-card">
      <strong style={{ fontSize: 26, lineHeight: 1.1 }}>{valor}</strong>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{rotulo}</span>
    </div>
  );
}

export default async function VereadorDossiePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const vereador = await fetchCamaraVereadorDossie(params.int_pes);

  if (!vereador) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/legislacao/camara/vereadores" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Vereadores</Link>
          <h1>Vereador não encontrado</h1>
          <p>Este vereador não existe na base coletada da Câmara Municipal.</p>
        </div>
      </main>
    );
  }

  const mandatos = vereador.mandatos || [];
  const proposicoes = vereador.proposicoes || [];
  const projetos = vereador.projetos || [];
  const porAno = vereador.por_ano || [];
  // Destaque = mandato mais recente com proposições; os demais mandatos aparecem à parte,
  // nunca somados no mesmo número.
  const [mandatoDestaque, ...outrosMandatos] = vereador.por_mandato || [];
  const rotuloMandato = (m) => `mandato ${m.inicio}–${m.fim}`;
  const frequencia = vereador.frequencia || [];
  const votos = vereador.votos || [];
  const periodoVotos = intervaloDeDatas(votos.map((v) => v.data_sessao));

  return (
    <main className="page-container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Legislação Municipal', url: '/legislacao' },
          { name: 'Vereadores', url: '/legislacao/camara/vereadores' },
          { name: vereador.nome, url: `/legislacao/camara/vereadores/${vereador.slug}` },
        ]}
      />
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
          <Link href="/legislacao/camara/vereadores" style={{ color: 'var(--text-muted)' }}>← Vereadores</Link>
        </p>
        <h1>{vereador.nome}</h1>
        <p style={{ margin: '6px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {mandatos.length === 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Mandato não informado no cadastro da Câmara.
            </span>
          )}
          {mandatos.map((m) => (
            <span key={m.periodo_inicio} className="availability-badge is-real">
              {m.partido || 'sem partido'} · {m.periodo_inicio}–{m.periodo_fim}
            </span>
          ))}
        </p>
      </div>

      <CamaraSubnav />

      {mandatoDestaque && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Numero valor={mandatoDestaque.indicacao} rotulo={`Indicações (${rotuloMandato(mandatoDestaque)})`} />
            <Numero valor={mandatoDestaque.requerimento} rotulo={`Requerimentos (${rotuloMandato(mandatoDestaque)})`} />
            <Numero valor={mandatoDestaque.sozinho} rotulo={`Assinadas sozinho (${rotuloMandato(mandatoDestaque)})`} />
          </div>
          {outrosMandatos.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
              Outros mandatos:{' '}
              {outrosMandatos
                .map((m) => `${m.indicacao} indicações e ${m.requerimento} requerimentos no ${rotuloMandato(m)}`)
                .join('; ')}
              .
            </p>
          )}
        </div>
      )}

      {(frequencia.length > 0 || votos.length > 0) && <AvisoExtracao />}

      {frequencia.length > 0 && (
        <SectionBlock
          title="Frequência nas sessões"
          description="Por ano, nas sessões com ata publicada entre a primeira e a última vez em que o nome aparece no mandato. Abra cada ano para ver as sessões e as atas."
        >
          <Frequencia linhas={frequencia} />
        </SectionBlock>
      )}

      {votos.length > 0 && (
        <SectionBlock
          title={`Votos registrados com o nome (${votos.length}, ${periodoVotos})`}
          description="Só as votações em que a ata diz como este vereador votou. Na maioria das votações a ata traz apenas o placar."
        >
          {votos.map((v) => (
            <Votacao
              key={v.votacao_id}
              mostrarSessao
              votacao={{ ...v, nominais: [{ nome: v.nome, voto: v.voto }] }}
            />
          ))}
        </SectionBlock>
      )}

      <SectionBlock
        title="O que pediu"
        description="Indicações (sugestões ao Executivo) e requerimentos (pedidos de informação ou providência) que assinou. Barras pelo ano do número da proposição; clique num ano para filtrar."
      >
        {proposicoes.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Nenhuma indicação ou requerimento publicado pela Câmara com este nome como autor.
          </p>
        ) : (
          <>
            <ProposicoesExplorer proposicoes={proposicoes} porAno={porAno} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
              A listagem da Câmara não traz a resposta do Executivo a cada pedido; por isso ela não aparece aqui.
            </p>
          </>
        )}
      </SectionBlock>

      {projetos.length > 0 && (
        <SectionBlock title="Projetos que apresentou" description="Projetos em tramitação com este nome como autor.">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {projetos.map((p) => (
              <li key={p.int_prjt} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 14 }}>
                <Link href={`/legislacao/camara/projetos/${p.int_prjt}`}>
                  Projeto nº {p.numero}/{p.exercicio}
                </Link>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {p.situacao}</span>
                <p style={{ margin: '4px 0 0' }}>{p.ementa}</p>
              </li>
            ))}
          </ul>
        </SectionBlock>
      )}
    </main>
  );
}
