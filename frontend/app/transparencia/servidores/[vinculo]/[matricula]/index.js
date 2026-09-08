import Link from 'next/link';
import { fetchFolhaServidorDossie } from '../../../../lib/api';
import { formatMoney } from '../../../../lib/format';
import SectionBlock from '../../../../components/SectionBlock';
import TransparenciaSubnav from '../../../../components/TransparenciaSubnav';
import BreadcrumbJsonLd from '../../../../components/BreadcrumbJsonLd';

// Vazio de proposito -- nao pre-renderiza nenhum vinculo no build (evita
// bater na API em CI). generateStaticParams (mesmo vazio) e' o que liga o
// modo ISR-on-demand nessa rota, mesmo padrao de /empenho/[id].
export async function generateStaticParams() {
  return [];
}

const MESES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', '13º salário',
];

function competenciaLabel(ano, mes) {
  return `${MESES[Number(mes)] || mes} de ${ano}`;
}

function rubricasDoRegistro(registro) {
  try {
    return JSON.parse(registro?.dados_extras || '{}').rubricas || [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const dossie = await fetchFolhaServidorDossie(params.vinculo, params.matricula);
  const nome = dossie?.historico?.[0]?.nome_servidor;
  return { title: nome ? `${nome} — Folha salarial` : 'Servidor' };
}

export default async function ServidorDossiePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const dossie = await fetchFolhaServidorDossie(params.vinculo, params.matricula);

  if (!dossie || !dossie.historico?.length) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/transparencia/servidores" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Servidores</Link>
          <h1>Servidor não encontrado</h1>
          <p>Este vínculo não existe na base coletada do Portal da Transparência.</p>
        </div>
      </main>
    );
  }

  const { historico } = dossie;
  const atual = historico[0];
  const rubricas = rubricasDoRegistro(atual);
  const proventos = rubricas.filter((r) => r.proventos);
  const descontos = rubricas.filter((r) => r.descontos);

  return (
    <main className="page-container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Dinheiro público', url: '/transparencia' },
          { name: 'Servidores', url: '/transparencia/servidores' },
          { name: atual.nome_servidor, url: `/transparencia/servidores/${params.vinculo}/${params.matricula}` },
        ]}
      />
      <div className="page-title">
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
            <Link href="/transparencia/servidores" style={{ color: 'var(--text-muted)' }}>← Servidores</Link>
          </p>
          <h1>{atual.nome_servidor}</h1>
          <p style={{ margin: '4px 0 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="availability-badge is-real">{atual.cargo}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{atual.situacao}</span>
            {atual.portal?.url && (
              <a href={atual.portal.url} target="_blank" rel="noopener noreferrer" className="availability-badge is-gov">
                ↗ Portal (busca manual)
              </a>
            )}
          </p>
        </div>
      </div>

      <TransparenciaSubnav />

      <SectionBlock
        title={`Situação atual (${competenciaLabel(atual.competencia_ano, atual.competencia_mes)})`}
        description="Vínculo, secretaria e remuneração no registro mais recente coletado."
      >
        <div className="admin-metric-grid">
          <div className="admin-metric-card">
            <span>Remuneração bruta ({competenciaLabel(atual.competencia_ano, atual.competencia_mes)})</span>
            <strong style={{ color: 'var(--accent)' }}>{formatMoney(atual.remuneracao_bruta)}</strong>
          </div>
          <div className="admin-metric-card">
            <span>Total líquido</span>
            <strong>{formatMoney(atual.total_liquido)}</strong>
          </div>
          <div className="admin-metric-card">
            <span>Secretaria</span>
            <strong style={{ fontSize: 15 }}>{atual.secretaria || '—'}</strong>
          </div>
          <div className="admin-metric-card">
            <span>Admissão</span>
            <strong style={{ fontSize: 15 }}>{atual.data_admissao || '—'}</strong>
          </div>
        </div>
      </SectionBlock>

      {rubricas.length > 0 && (
        <SectionBlock
          title="Proventos e descontos"
          description={`Rubricas do contracheque de ${competenciaLabel(atual.competencia_ano, atual.competencia_mes)}.`}
        >
          <dl className="keyvalue-list">
            {proventos.map((r, idx) => (
              <div key={`p-${idx}`} className="keyvalue-row">
                <dt>{r.descricao}</dt>
                <dd style={{ fontSize: 13, color: 'var(--success)' }}>+ {formatMoney(r.proventos)}</dd>
              </div>
            ))}
            {descontos.map((r, idx) => (
              <div key={`d-${idx}`} className="keyvalue-row">
                <dt>{r.descricao}</dt>
                <dd style={{ fontSize: 13, color: 'var(--error)' }}>− {formatMoney(r.descontos)}</dd>
              </div>
            ))}
          </dl>
        </SectionBlock>
      )}

      <SectionBlock
        title="Histórico de competências"
        description="Remuneração bruta e líquida em cada mês publicado — do mais recente ao mais antigo."
      >
        <div className="table-scroll-x">
          <div className="simple-table" style={{ minWidth: 520 }}>
            <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12 }}>
              <span>Competência</span>
              <span style={{ textAlign: 'right' }}>Bruto</span>
              <span style={{ textAlign: 'right' }}>Líquido</span>
            </div>
            {historico.map((h) => (
              <div
                key={`${h.competencia_ano}-${h.competencia_mes}`}
                className="table-row"
                style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12, padding: '8px 0' }}
              >
                <span style={{ fontSize: 13 }}>
                  {competenciaLabel(h.competencia_ano, h.competencia_mes)}
                  {h.cargo !== atual.cargo && <span style={{ color: 'var(--text-muted)' }}> · {h.cargo}</span>}
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(h.remuneracao_bruta)}</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{formatMoney(h.total_liquido)}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionBlock>
    </main>
  );
}
