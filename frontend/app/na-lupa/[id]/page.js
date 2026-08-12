import Link from 'next/link';
import { fetchAlerta } from '../../lib/api';
import { formatMoney, formatDate, labelTipo } from '../../lib/format';
import { nivelLabel } from '../../lib/descobertas';
import { DISCLAIMER_DESCOBERTAS } from '../../lib/disclaimer';
import styles from '../styles.module.css';

const BADGE_NIVEL = {
  critico: styles.badgeCritico,
  atencao: styles.badgeAtencao,
  info: styles.badgeNeutral,
};

function metricLabel(alerta) {
  const unidade = alerta?.metadados?.unidade;
  if (unidade === 'R$' && alerta.valor_total != null) {
    return formatMoney(alerta.valor_total);
  }
  if (unidade && alerta.valor_total != null) {
    return `${Number(alerta.valor_total).toLocaleString('pt-BR')} ${unidade}`;
  }
  return alerta.valor_total ? formatMoney(alerta.valor_total) : null;
}

// Título/resposta que o cidadão lê. Prefere os campos novos (pergunta_cidada,
// resposta_direta) quando a IA já os gerou; senão cai nos formatos anteriores.
function tituloCidadao(alerta, discovery) {
  return discovery?.pergunta_cidada || alerta.titulo;
}

function respostaCidada(alerta, discovery) {
  return (
    discovery?.narrativa_consolidada ||
    discovery?.resposta_direta ||
    discovery?.hipotese_publica ||
    alerta.narrativa ||
    null
  );
}

export async function generateMetadata(props) {
  const params = await props.params;
  const alerta = await fetchAlerta(params.id).catch(() => null);
  if (!alerta?.titulo) {
    return { title: 'Item em análise nos dados públicos de Ritápolis' };
  }
  const discovery = alerta.metadados?.discovery_v3 || alerta.metadados?.discovery_v2 || null;
  return {
    title: tituloCidadao(alerta, discovery),
    description: `${String(respostaCidada(alerta, discovery) || alerta.objeto || alerta.titulo).slice(0, 155)} — dado público de Ritápolis/MG, com fonte oficial.`,
  };
}

function humanizarChaveMetrica(chave) {
  return String(chave || '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

// Métricas/comparativos são schema-livre — o formatador não presume forma fixa.
function formatarValorMetrica(valor) {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR');
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function MetricasGenericas({ titulo, dados }) {
  const entradas = Object.entries(dados || {});
  if (!entradas.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{titulo}</h2>
      <div className={styles.metrics}>
        {entradas.map(([chave, valor]) => (
          <div className={styles.metric} key={chave}>
            <span className={styles.metricLabel}>{humanizarChaveMetrica(chave)}</span>
            <span className={styles.metricValue}>{formatarValorMetrica(valor)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function NaLupaDetalhePage(props) {
  const params = await props.params;
  const id = Number(params.id);
  let alerta = null;
  let erro = null;

  try {
    alerta = await fetchAlerta(id);
  } catch (err) {
    erro = err.message;
  }

  if (erro || !alerta) {
    return (
      <main className={styles.container}>
        <Link href="/na-lupa" className={styles.back}>← Voltar para Na Lupa</Link>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Item não encontrado</p>
          <p>{erro || 'O item solicitado não existe ou foi removido.'}</p>
        </div>
      </main>
    );
  }

  const documentos = alerta.documentos || [];
  const evidencias = alerta.evidencias || [];
  const discovery = alerta.metadados?.discovery_v3 || alerta.metadados?.discovery_v2 || null;
  const metric = metricLabel(alerta);
  const resposta = respostaCidada(alerta, discovery);
  const temPeriodo = alerta.periodo_inicio || alerta.periodo_fim;
  const fatos = discovery?.o_que_os_dados_mostram || [];
  const lacunas = discovery?.lacunas_encontradas || [];
  const perguntas = discovery?.perguntas_abertas || alerta.questionamentos || [];
  const temFontes = evidencias.length > 0 || documentos.length > 0;

  return (
    <main className={styles.container}>
      <header className={styles.detailHead}>
        <Link href="/na-lupa" className={styles.back}>← Na Lupa</Link>
        <h1 className={styles.detailTitle}>{tituloCidadao(alerta, discovery)}</h1>
        <div className={styles.detailBadges}>
          {alerta.categoria ? <span className={styles.badge}>{alerta.categoria}</span> : null}
          <span className={`${styles.badge} ${BADGE_NIVEL[alerta.severidade] || styles.badgeNeutral}`}>
            {nivelLabel(alerta.severidade)}
          </span>
        </div>
      </header>

      {resposta ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>O que encontramos</h2>
          <p className={styles.narrativa}>{resposta}</p>
          {temPeriodo ? (
            <p className={styles.sectionNote}>
              Período coberto: {alerta.periodo_inicio ? formatDate(alerta.periodo_inicio) : '—'}
              {' até '}
              {alerta.periodo_fim ? formatDate(alerta.periodo_fim) : '—'}
            </p>
          ) : null}
        </section>
      ) : null}

      {metric ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Valor em foco</h2>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>{alerta.valor_periodo_label || 'Total'}</span>
              <span className={styles.metricValue}>{metric}</span>
            </div>
          </div>
        </section>
      ) : null}

      {discovery?.por_que_olhar ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Por que vale olhar</h2>
          <p className={styles.narrativa}>{discovery.por_que_olhar}</p>
        </section>
      ) : null}

      <MetricasGenericas titulo="Métricas" dados={discovery?.metricas} />
      <MetricasGenericas titulo="Comparativos" dados={discovery?.comparativos} />

      {/* O que o cidadão pode fazer — estático, não depende de IA. Aponta para as
          fontes oficiais (abaixo) e explica o direito de pedir explicação (LAI). */}
      <section className={`${styles.section} ${styles.acaoBox}`}>
        <h2 className={styles.sectionTitle}>O que você pode fazer</h2>
        <ul className={styles.acaoList}>
          {temFontes ? (
            <li>Confira você mesmo nos documentos e fontes oficiais listados abaixo.</li>
          ) : null}
          <li>
            Não achou a resposta? Todo cidadão pode pedir explicação à Prefeitura pela{' '}
            <strong>Lei de Acesso à Informação (e-SIC/LAI)</strong> — é gratuito e a resposta é
            obrigatória. Cite o período e os documentos desta página no pedido.
          </li>
        </ul>
      </section>

      {(fatos.length || lacunas.length || perguntas.length) ? (
        <details className={styles.evidenciasDetalhes}>
          <summary>Ver detalhes da análise</summary>
          {fatos.length ? (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>O que os dados mostram</h3>
              <ul className={styles.findingsList}>
                {fatos.map((item, i) => (<li key={i}>{item}</li>))}
              </ul>
            </div>
          ) : null}
          {lacunas.length ? (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>O que não apareceu nos documentos analisados</h3>
              <ul className={styles.lacunasList}>
                {lacunas.map((item, i) => (<li key={i}>{item}</li>))}
              </ul>
            </div>
          ) : null}
          {perguntas.length ? (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Perguntas em aberto</h3>
              <ul className={styles.investigar}>
                {perguntas.map((q, i) => (<li key={i}>{q}</li>))}
              </ul>
            </div>
          ) : null}
        </details>
      ) : null}

      {evidencias.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Evidências factuais ({evidencias.length})</h2>
          <p className={styles.sectionNote}>
            Cada evidência aponta para o documento ou anexo usado na contagem.
          </p>
          <div className={styles.docs}>
            {evidencias.map((ev) => (
              <article key={ev.id} className={styles.docCard}>
                <div className={styles.docTop}>
                  {ev.fato_quantidade ? (
                    <span className={styles.tag}>
                      {ev.fato_quantidade} {ev.fato_unidade || ''}
                    </span>
                  ) : null}
                </div>
                <h3 className={styles.docTitle}>
                  {ev.fato_descricao ||
                    (ev.metadados?.empenho
                      ? `Empenho ${ev.metadados.empenho}/${ev.metadados.exercicio}${ev.metadados.credor_nome ? ` — ${ev.metadados.credor_nome}` : ''}`
                      : `Evidencia ${ev.id}`)}
                </h3>
                {ev.trecho_fonte ? (
                  <p className={styles.evidenceText}>
                    {ev.trecho_fonte}
                  </p>
                ) : null}
                <div className={styles.docMeta}>
                  {ev.metadados?.valor != null ? <span>{formatMoney(ev.metadados.valor)}</span> : null}
                  {ev.documento_id ? (
                    <Link href={`/documento/${ev.documento_id}`}>
                      Documento pai #{ev.documento_id}
                    </Link>
                  ) : null}
                  {ev.anexo_id ? (
                    <Link href={`/anexo/${ev.anexo_id}`}>
                      Anexo: {ev.anexo_nome || `#${ev.anexo_id}`}
                    </Link>
                  ) : null}
                  {ev.metadados?.empenho_id ? (
                    <Link href={`/empenho/${ev.metadados.empenho_id}`}>Ver empenho no site</Link>
                  ) : null}
                  {ev.metadados?.portal_url ? (
                    <a href={ev.metadados.portal_url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                      Fonte oficial (Portal) ↗
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {documentos.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Documentos vinculados ({documentos.length})</h2>
          <p className={styles.sectionNote}>
            Cada documento mantém o link para sua fonte original — a procedência nunca some.
          </p>
          <div className={styles.docs}>
            {documentos.map((doc) => (
              <article key={doc.documento_id} className={styles.docCard}>
                <div className={styles.docTop}>
                  <span className={styles.badge}>{labelTipo(doc.tipo)}</span>
                  {doc.ano ? <span className={styles.tag}>{doc.ano}</span> : null}
                  <span className={styles.tag}>papel: {doc.papel}</span>
                </div>
                <h3 className={styles.docTitle}>
                  <Link href={`/documento/${doc.documento_id}`}>
                    {doc.titulo || `Documento ${doc.documento_id}`}
                  </Link>
                </h3>
                <div className={styles.docMeta}>
                  {doc.data_publicacao ? (
                    <span>Publicado: {formatDate(doc.data_publicacao)}</span>
                  ) : null}
                  {doc.url_origem ? (
                    <a
                      href={doc.url_origem}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sourceLink}
                    >
                      Abrir fonte original ↗
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <p className={styles.disclaimer}>{DISCLAIMER_DESCOBERTAS}</p>
    </main>
  );
}
