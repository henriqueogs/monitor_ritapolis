import Link from 'next/link';
import { fetchCamaraVereadores } from '../../../lib/api';
import { ORIGEM_SGC, UF } from '../../../../lib/ente';
import SectionBlock from '../../../components/SectionBlock';
import CamaraSubnav from '../../../components/CamaraSubnav';

export const metadata = {
  title: 'Vereadores — Câmara Municipal',
  description:
    'Vereadores de Ritápolis/MG: eleitos e suplentes (TSE), mandato, partido e o que cada um pediu ao Executivo.',
};

const ESTILO_LINHA = { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 };
// display inline: o .admin-metric-card põe span em bloco.
const ESTILO_FONTE = { display: 'inline', fontWeight: 600, marginRight: 4 };

const formatarVotos = (n) => `${Number(n).toLocaleString('pt-BR')} ${Number(n) === 1 ? 'voto' : 'votos'}`;
const situacaoLegivel = (s) => String(s || '').charAt(0) + String(s || '').slice(1).toLowerCase();

function Cartao({ v }) {
  // Um número por mandato, nunca somados.
  const porMandato = v.proposicoes_por_mandato || [];
  const { eleicao } = v;
  return (
    <Link
      href={`/legislacao/camara/vereadores/${v.slug}`}
      className="admin-metric-card"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <strong style={{ fontSize: 15 }}>{v.nome}</strong>
      {eleicao && (
        <span style={ESTILO_LINHA}>
          <span style={ESTILO_FONTE}>TSE {eleicao.ano}:</span> {eleicao.partido} · {formatarVotos(eleicao.votos)} ·{' '}
          {situacaoLegivel(eleicao.situacao)}
        </span>
      )}
      {v.int_pes && v.partido_atual && (
        <span style={ESTILO_LINHA}>
          <span style={ESTILO_FONTE}>Câmara (SGC):</span> {v.partido_atual} · mandato até {v.mandato_fim}
        </span>
      )}
      <span style={ESTILO_LINHA}>
        {porMandato.length > 0
          ? porMandato
              .map((m) => `${m.total} indicações e requerimentos (mandato ${m.inicio}–${m.fim})`)
              .join(' · ')
          : 'Sem indicação ou requerimento publicado'}
      </span>
    </Link>
  );
}

function Grade({ pessoas }) {
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {pessoas.map((v) => <Cartao key={v.slug} v={v} />)}
    </div>
  );
}

function FonteTse({ eleicao }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
      Fonte: Tribunal Superior Eleitoral,{' '}
      <a href={eleicao.url_origem} target="_blank" rel="noopener noreferrer">
        página do conjunto de dados resultados-{eleicao.ano}
      </a>
      , arquivo <code>votacao_candidato_munzona_{eleicao.ano}_{UF}.csv</code> filtrado pelo município
      e pelo cargo de vereador (votos somados entre zonas). Só dados públicos da candidatura: nome,
      partido, votos e situação.
    </p>
  );
}

const porVotos = (a, b) => b.eleicao.votos - a.eleicao.votos || a.nome.localeCompare(b.nome, 'pt-BR');

export default async function VereadoresPage() {
  const pessoas = await fetchCamaraVereadores();
  const comEleicao = pessoas.filter((v) => v.eleicao);
  const anoEleicao = Math.max(...comEleicao.map((v) => v.eleicao.ano));
  const daEleicao = comEleicao.filter((v) => v.eleicao.ano === anoEleicao);
  const eleitos = daEleicao.filter((v) => v.eleicao.eleito).sort(porVotos);
  const suplentes = daEleicao.filter((v) => !v.eleicao.eleito).sort(porVotos);
  const outros = pessoas.filter((v) => !v.eleicao || v.eleicao.ano !== anoEleicao);
  const exemplo = daEleicao[0]?.eleicao;

  return (
    <main className="page-container">
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/legislacao" style={{ color: 'var(--text-muted)' }}>← Legislação Municipal</Link>
        </p>
        <h1>Vereadores</h1>
        <p>
          Eleitos e suplentes segundo o TSE, quem está no cadastro da Câmara e quem assinou indicações
          e requerimentos. Cada linha diz de onde veio o dado.
        </p>
      </div>

      <CamaraSubnav />

      {pessoas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhum vereador encontrado.</p>}

      {eleitos.length > 0 && (
        <SectionBlock
          title={`Eleitos em ${anoEleicao} (${eleitos.length})`}
          description={`Resultado oficial da eleição de ${anoEleicao}, do mais ao menos votado. Partido e votos são os da candidatura; o partido atual, quando a Câmara informa, aparece marcado como SGC.`}
        >
          <Grade pessoas={eleitos} />
          <FonteTse eleicao={exemplo} />
        </SectionBlock>
      )}

      {suplentes.length > 0 && (
        <SectionBlock
          title={`Suplentes da eleição de ${anoEleicao} (${suplentes.length})`}
          description="Assumem a cadeira quando um eleito se licencia ou deixa o cargo. Quem está em exercício aparece também com o mandato do cadastro da Câmara (SGC)."
        >
          <Grade pessoas={suplentes} />
          <FonteTse eleicao={exemplo} />
        </SectionBlock>
      )}

      {outros.length > 0 && (
        <SectionBlock
          title="Outros nomes"
          description="No cadastro da Câmara, nas proposições ou nas atas das sessões, sem candidatura eleita ou suplente na última eleição importada (por exemplo, da legislatura anterior)."
        >
          <Grade pessoas={outros} />
          {outros.some((v) => v.eleicao) && <FonteTse eleicao={outros.find((v) => v.eleicao).eleicao} />}
        </SectionBlock>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Mandatos e partidos marcados como SGC vêm do{' '}
        <a href={ORIGEM_SGC} target="_blank" rel="noopener noreferrer">
          sistema da Câmara Municipal
        </a>
        , que não lista todos os vereadores.
      </p>
    </main>
  );
}
