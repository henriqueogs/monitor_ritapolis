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

function investigationLabel(discovery, alerta) {
  const tipo = discovery?.tipo_investigacao || alerta?.metadados?.investigacao_tipo;
  const labels = {
    'meio_ambiente.supressao_arvores': 'Meio ambiente',
    supressao_arvores: 'Meio ambiente',
    'compras.precos_itens': 'Compras/precos',
    'contratos.recorrencia_fornecedor_objeto': 'Contratos recorrentes',
    'eventos.gastos_eventos_publicos': 'Eventos publicos',
  };
  return labels[tipo] || tipo || null;
}

function humanizarChaveMetrica(chave) {
  return String(chave || '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

// Métricas/comparativos são schema-livre (Record<string, any>) — o
// formatador não presume forma numérica fixa; string/objeto também passam.
function formatarValorMetrica(valor) {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR');
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

// Grade genérica de métricas: 0, 1 ou N entradas — sem template fixo tipo
// "Total + Período" para todo tipo de investigação.
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

export default async function DescobertaDetalhePage({ params }) {
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
        <Link href="/descobertas" className={styles.back}>← Voltar para descobertas</Link>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Descoberta não encontrada</p>
          <p>{erro || 'A descoberta solicitada não existe ou foi removida.'}</p>
        </div>
      </main>
    );
  }

  const documentos = alerta.documentos || [];
  const evidencias = alerta.evidencias || [];
  const discovery = alerta.metadados?.discovery_v2 || null;
  const metric = metricLabel(alerta);
  const investigation = investigationLabel(discovery, alerta);

  return (
    <main className={styles.container}>
      <header className={styles.detailHead}>
        <Link href="/descobertas" className={styles.back}>← Todas as descobertas</Link>
        <h1 className={styles.detailTitle}>{alerta.titulo}</h1>
        <div className={styles.detailBadges}>
          <span className={`${styles.badge} ${BADGE_NIVEL[alerta.severidade] || styles.badgeNeutral}`}>
            {nivelLabel(alerta.severidade)}
          </span>
          {alerta.categoria ? <span className={styles.badge}>{alerta.categoria}</span> : null}
          {investigation ? <span className={styles.badge}>{investigation}</span> : null}
          {discovery?.status ? <span className={`${styles.badge} admin-only`}>IA: {discovery.status}</span> : null}
          <span className={styles.badge}>{alerta.tipo === 'processo' ? 'por processo' : 'padrão'}</span>
        </div>
        <p className={styles.disclaimer}>{DISCLAIMER_DESCOBERTAS}</p>
      </header>

      {discovery?.narrativa_consolidada ? (
        <>
          {/* Formato consolidado: um parágrafo já traz fatos + lacuna relevante
              em prosa — Período coberto vira legenda, não seção própria. */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Análise</h2>
            <p className={styles.narrativa}>{discovery.narrativa_consolidada}</p>
            {alerta.periodo_inicio || alerta.periodo_fim ? (
              <p className={styles.sectionNote}>
                Período coberto: {alerta.periodo_inicio ? formatDate(alerta.periodo_inicio) : '—'}
                {' até '}
                {alerta.periodo_fim ? formatDate(alerta.periodo_fim) : '—'}
              </p>
            ) : null}
          </section>

          <MetricasGenericas titulo="Métricas" dados={discovery.metricas} />
          <MetricasGenericas titulo="Comparativos" dados={discovery.comparativos} />

          {discovery.o_que_os_dados_mostram?.length || discovery.lacunas_encontradas?.length ? (
            <details className={styles.evidenciasDetalhes}>
              <summary>Ver fatos e lacunas em detalhe</summary>
              {discovery.o_que_os_dados_mostram?.length ? (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>O que os dados mostram</h3>
                  <ul className={styles.findingsList}>
                    {discovery.o_que_os_dados_mostram.map((item, i) => (<li key={i}>{item}</li>))}
                  </ul>
                </div>
              ) : null}
              {discovery.lacunas_encontradas?.length ? (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>O que não apareceu nos documentos analisados</h3>
                  <ul className={styles.lacunasList}>
                    {discovery.lacunas_encontradas.map((item, i) => (<li key={i}>{item}</li>))}
                  </ul>
                </div>
              ) : null}
            </details>
          ) : null}
        </>
      ) : discovery ? (
        // Formato antigo (investigação gerada antes de narrativa_consolidada
        // existir) — rendering inalterado, sem forçar re-geração em massa.
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>O que chamou atencao</h2>
            <p className={styles.narrativa}>{discovery.hipotese_publica}</p>
          </section>

          {discovery.o_que_os_dados_mostram?.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>O que os dados mostram</h2>
              <ul className={styles.findingsList}>
                {discovery.o_que_os_dados_mostram.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {discovery.lacunas_encontradas?.length ? (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>O que nao apareceu nos documentos analisados</h2>
              <ul className={styles.lacunasList}>
                {discovery.lacunas_encontradas.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : alerta.narrativa ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Análise</h2>
          <p className={styles.narrativa}>{alerta.narrativa}</p>
        </section>
      ) : null}

      {metric ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Metrica principal</h2>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Total</span>
              <span className={styles.metricValue}>{metric}</span>
            </div>
            {alerta.valor_periodo_label ? (
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Período</span>
                <span className={styles.metricValue}>{alerta.valor_periodo_label}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {(alerta.periodo_inicio || alerta.periodo_fim) && !discovery?.narrativa_consolidada ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Período coberto</h2>
          <p className={styles.narrativa}>
            {alerta.periodo_inicio ? formatDate(alerta.periodo_inicio) : '—'}
            {' até '}
            {alerta.periodo_fim ? formatDate(alerta.periodo_fim) : '—'}
          </p>
        </section>
      ) : null}

      {(discovery?.perguntas_abertas?.length || alerta.questionamentos?.length) ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Perguntas abertas</h2>
          <ul className={styles.investigar}>
            {(discovery?.perguntas_abertas?.length ? discovery.perguntas_abertas : alerta.questionamentos).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {discovery ? (
        <section className={`${styles.section} admin-only`}>
          <h2 className={styles.sectionTitle}>Analise admin</h2>
          <p className={styles.narrativa}>{discovery.analise_admin}</p>
          <div className={styles.adminBox}>
            <strong>Contrato:</strong> {discovery.contrato_versao || 'discovery-investigation-v2'}
            {' | '}
            <strong>Status:</strong> {discovery.status || 'ok'}
            {' | '}
            <strong>Confianca:</strong> {Math.round((discovery.nivel_confianca || 0) * 100)}%
            {' | '}
            <strong>Score:</strong> {Math.round((discovery.score_publicacao || discovery.nivel_confianca || 0) * 100)}%
            {discovery.motivo_publicacao ? ` | Publicacao: ${discovery.motivo_publicacao}` : ''}
            {discovery.provider ? ` | Provider: ${discovery.provider}` : ''}
            {discovery.modelo ? ` | Modelo: ${discovery.modelo}` : ''}
            {discovery.erro ? ` | Erro: ${discovery.erro}` : ''}
          </div>
          <pre className={styles.adminPayload}>{JSON.stringify(discovery, null, 2)}</pre>
        </section>
      ) : null}

      {evidencias.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Evidencias factuais ({evidencias.length})</h2>
          <p className={styles.sectionNote}>
            Cada evidencia aponta para o documento ou anexo usado na contagem.
          </p>
          <div className={styles.docs}>
            {evidencias.map((ev) => (
              <article key={ev.id} className={styles.docCard}>
                <div className={styles.docTop}>
                  {ev.fato_tipo ? <span className={`${styles.badge} admin-only`}>{ev.fato_tipo}</span> : null}
                  {ev.fato_subtipo ? <span className={`${styles.tag} admin-only`}>{ev.fato_subtipo}</span> : null}
                  {ev.fato_quantidade ? (
                    <span className={styles.tag}>
                      {ev.fato_quantidade} {ev.fato_unidade || ''}
                    </span>
                  ) : null}
                </div>
                <h3 className={styles.docTitle}>
                  {ev.fato_descricao || `Evidencia ${ev.id}`}
                </h3>
                {ev.trecho_fonte ? <p className={`${styles.evidenceText} admin-only`}>{ev.trecho_fonte}</p> : null}
                <div className={styles.docMeta}>
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
    </main>
  );
}
