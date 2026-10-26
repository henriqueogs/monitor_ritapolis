import Link from 'next/link';
import { formatDate } from '../../../lib/format';
import { nivelLabel, qualidadeMotivoLabel } from '../../../lib/descobertas';
import {
  descreverRegra,
  formatarMetricaAlerta,
  formatarPar,
  situacaoGate,
  ROTULO_PENDENCIA,
  ROTULO_RECOMENDACAO,
} from '../../../../lib/alerta-revisao';
import EvidenciasLista from './EvidenciasLista';
import DecisaoEditorial from './DecisaoEditorial';
import styles from './styles.module.css';

function Pares({ dados }) {
  const entradas = Object.entries(dados || {});
  if (!entradas.length) return null;
  return (
    <dl className={styles.pares}>
      {entradas.map(([chave, valor]) => (
        <div key={chave}>
          <dt>{chave.replace(/_/g, ' ')}</dt>
          <dd>{formatarPar(chave, valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Lista({ titulo, itens }) {
  if (!itens?.length) return null;
  return (
    <div className={styles.bloco}>
      <h3>{titulo}</h3>
      <ul>
        {itens.map((item, i) => (
          <li key={i}>{typeof item === 'string' ? item : formatarPar('', item)}</li>
        ))}
      </ul>
    </div>
  );
}

function Revalidacao({ revalidacao }) {
  if (!revalidacao) return null;
  const { recomendacao, pendencias } = revalidacao;
  return (
    <section className={`${styles.section} ${styles[`rec_${recomendacao}`] || ''}`}>
      <h2>Revalidação automática: {ROTULO_RECOMENDACAO[recomendacao] || recomendacao}</h2>
      {pendencias.length ? (
        <ul className={styles.pendencias}>
          {pendencias.map((p) => (
            <li key={p.codigo} className={styles[`grav_${p.gravidade}`]}>
              <strong>{ROTULO_PENDENCIA[p.codigo] || p.codigo}</strong>: {p.mensagem}
              {p.detalhes?.length ? ` (${p.detalhes.map(qualidadeMotivoLabel).join('; ')})` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Nenhuma regra automática apontou problema. A decisão continua sendo sua.</p>
      )}
    </section>
  );
}

function InvestigacaoIa({ alerta, gate }) {
  const d = alerta.metadados?.discovery_v3;
  return (
    <section className={styles.section}>
      <h2>Investigação da IA</h2>
      {gate.deterministico ? (
        <p className={styles.muted}>
          Não se aplica: o achado é uma conta sobre dados oficiais (regra determinística), sem leitura da IA.
        </p>
      ) : null}
      {!d && !gate.deterministico ? <p className={styles.muted}>{gate.bloqueio}</p> : null}
      {d ? (
        <>
          <p className={styles.muted}>
            Gate factual: <strong>{gate.factual || '—'}</strong> · editorial: <strong>{gate.editorial || '—'}</strong>
            {d.geracao?.modelo ? ` · modelo ${d.geracao.modelo}` : ''}
            {d.qualidade?.verificado_em ? ` · verificado em ${formatDate(d.qualidade.verificado_em)}` : ''}
          </p>
          {d.pergunta_cidada ? <p><strong>Pergunta:</strong> {d.pergunta_cidada}</p> : null}
          {d.resposta_direta ? <p><strong>Resposta:</strong> {d.resposta_direta}</p> : null}
          {d.narrativa_consolidada ? <p>{d.narrativa_consolidada}</p> : null}
          <Lista titulo="Motivos do gate" itens={(gate.motivos || []).map(qualidadeMotivoLabel)} />
          <Lista titulo="O que os dados mostram" itens={d.o_que_os_dados_mostram} />
          <Lista titulo="Lacunas encontradas" itens={d.lacunas_encontradas} />
          <Lista titulo="Limites para publicar" itens={d.limites_publicacao} />
        </>
      ) : null}
    </section>
  );
}

function Historico({ historico }) {
  if (!historico?.length) return null;
  return (
    <section className={styles.section}>
      <h2>Histórico de decisões</h2>
      <ul className={styles.historico}>
        {historico.map((h) => (
          <li key={h.id}>
            <span className={styles.muted}>{formatDate(h.criado_em)}</span> · {h.estado_anterior || 'novo'} →{' '}
            <strong>{h.estado_novo}</strong> ({h.origem})
            {h.motivos?.length ? <div className={styles.muted}>{h.motivos.map(qualidadeMotivoLabel).join(' · ')}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AlertaRevisao({ alerta }) {
  const meta = alerta.metadados || {};
  const regra = descreverRegra(alerta);
  const metrica = formatarMetricaAlerta(alerta);
  const gate = situacaoGate(alerta);

  return (
    <div className={styles.page}>
      <Link href="/admin/alertas" className={styles.voltar}>← Fila de descobertas</Link>
      <header className={styles.header}>
        <span className={styles.muted}>
          #{alerta.id} · {alerta.estado_editorial} · {alerta.status} · {nivelLabel(alerta.severidade)} ·{' '}
          {alerta.categoria || 'sem categoria'}
        </span>
        <h1>{alerta.titulo}</h1>
        {alerta.narrativa ? <p>{alerta.narrativa}</p> : null}
        {metrica ? (
          <p className={styles.metrica}>
            {metrica.texto}
            {alerta.valor_periodo_label ? <span className={styles.muted}> · {alerta.valor_periodo_label}</span> : null}
          </p>
        ) : null}
      </header>

      <Revalidacao revalidacao={alerta.revalidacao} />

      <section className={styles.section}>
        <h2>Regra que disparou: {regra.nome}</h2>
        <p>{regra.explicacao}</p>
        <Pares dados={meta.metricas_deterministicas} />
        <Pares dados={meta.comparativos_deterministicos} />
        <Lista titulo="Sinais do detector" itens={meta.motivos || (meta.motivo ? [meta.motivo] : null)} />
        <p className={styles.muted}>
          Período: {alerta.periodo_inicio ? formatDate(alerta.periodo_inicio) : '—'} a{' '}
          {alerta.periodo_fim ? formatDate(alerta.periodo_fim) : '—'} · confiança{' '}
          {alerta.confianca != null ? Number(alerta.confianca).toFixed(2) : '—'} · código {regra.codigo}
        </p>
      </section>

      <EvidenciasLista evidencias={alerta.evidencias} documentos={alerta.documentos} />

      <section className={styles.section}>
        <h2>O que conferir antes de decidir</h2>
        <Lista titulo="Campos a verificar nos documentos" itens={meta.campos_a_verificar} />
        <Lista titulo="Lacunas já conhecidas" itens={meta.lacunas_deterministicas} />
        <Lista titulo="Perguntas" itens={alerta.questionamentos} />
      </section>

      <InvestigacaoIa alerta={alerta} gate={gate} />
      <DecisaoEditorial alerta={alerta} gate={gate} />
      <Historico historico={alerta.historico_editorial} />
    </div>
  );
}
