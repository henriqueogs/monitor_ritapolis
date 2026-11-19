import Link from 'next/link';
import { fetchCamaraSessao } from '../../../../lib/api';
import SectionBlock from '../../../../components/SectionBlock';
import CamaraSubnav from '../../../../components/CamaraSubnav';
import Votacao, { AvisoExtracao, formatarData } from '../../components/Votacao';
import { slugParlamentar } from '../../components/slug';

const TIPO_LABEL = { ata_ordinaria: 'Sessão ordinária', ata_extraordinaria: 'Sessão extraordinária' };
const SITUACAO_LABEL = {
  presente: 'Presentes',
  ausente_justificada: 'Ausência justificada',
  ausente: 'Ausência',
};

function titulo(sessao) {
  return `${TIPO_LABEL[sessao.tipo] || 'Sessão'} nº ${sessao.numero}/${sessao.ano}`;
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const sessao = await fetchCamaraSessao(params.id);
  return { title: sessao ? `${titulo(sessao)} — Câmara Municipal` : 'Sessão não encontrada' };
}

function Pessoas({ sessao, situacao }) {
  const nomes = sessao.presencas.filter((p) => p.situacao === situacao).map((p) => p.nome);
  if (nomes.length === 0) {return null;}
  return (
    <p style={{ fontSize: 14, lineHeight: 1.7, margin: '0 0 8px' }}>
      <strong>{SITUACAO_LABEL[situacao]} ({nomes.length}):</strong>{' '}
      {nomes.map((nome, i) => (
        <span key={nome}>
          {i > 0 && ', '}
          <Link href={`/legislacao/camara/vereadores/${slugParlamentar(nome)}`}>{nome}</Link>
        </span>
      ))}
    </p>
  );
}

export default async function SessaoPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const sessao = await fetchCamaraSessao(params.id);

  if (!sessao) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/legislacao/camara/sessoes" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Sessões</Link>
          <h1>Sessão não encontrada</h1>
          <p>A ata desta sessão ainda não foi lida ou não passou na conferência.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container">
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/legislacao/camara/sessoes" style={{ color: 'var(--text-muted)' }}>← Sessões e votações</Link>
        </p>
        <h1>{titulo(sessao)}</h1>
        <p>Realizada em {formatarData(sessao.data_sessao)}{sessao.presidente ? `, presidida por ${sessao.presidente}` : ''}.</p>
      </div>

      <CamaraSubnav />
      <AvisoExtracao />

      <SectionBlock title="Quem estava" description="Como consta na abertura da ata.">
        <Pessoas sessao={sessao} situacao="presente" />
        <Pessoas sessao={sessao} situacao="ausente_justificada" />
        <Pessoas sessao={sessao} situacao="ausente" />
      </SectionBlock>

      <SectionBlock
        title={`Votações (${sessao.votacoes.length})`}
        description="Uma entrada por deliberação registrada na ata, na ordem em que aparece."
      >
        {sessao.votacoes.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhuma votação identificada nesta ata.</p>
        ) : (
          sessao.votacoes.map((v) => <Votacao key={v.id} votacao={{ ...v, url_pdf: sessao.url_pdf, url_origem: sessao.url_origem }} />)
        )}
      </SectionBlock>

      {sessao.avisos.length > 0 && (
        <SectionBlock
          title="O que a conferência automática apontou"
          description="Pontos em que a leitura não bateu com o texto da ata. Itens descartados não aparecem acima."
        >
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            {sessao.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
          </ul>
        </SectionBlock>
      )}

      <SectionBlock title="Fonte oficial" description="Tudo nesta página vem deste documento.">
        <p style={{ fontSize: 14, margin: 0, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {sessao.url_pdf && <a href={sessao.url_pdf} target="_blank" rel="noopener noreferrer">Ata em PDF na Câmara ↗</a>}
          <a href={sessao.url_origem} target="_blank" rel="noopener noreferrer">Listagem oficial ↗</a>
          <Link href={`/documento/${sessao.documento_id}`}>Ver a ata no acervo</Link>
        </p>
      </SectionBlock>
    </main>
  );
}
