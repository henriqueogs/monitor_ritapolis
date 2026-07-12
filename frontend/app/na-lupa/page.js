import Link from 'next/link';
import { fetchAlertas } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import { nivelLabel } from '../lib/descobertas';
import { DISCLAIMER_DESCOBERTAS } from '../lib/disclaimer';
import styles from './styles.module.css';

export const metadata = {
  title: 'Na Lupa',
  description:
    'Gastos e contratos públicos de Ritápolis/MG que valem um segundo olhar — em linguagem simples, com a fonte oficial e como pedir explicação.',
};

// Quantos temas mostrar como filtro antes de agrupar o resto em "Todas".
const MAX_CHIPS_TEMA = 8;

function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function discoveryV2(alerta) {
  return alerta?.metadados?.discovery_v2 || null;
}

// Título que o cidadão lê: a pergunta gerada pela IA quando existe; senão o
// título factual. Não forçamos "?" em títulos antigos — seria falso.
function tituloCidadao(alerta) {
  return discoveryV2(alerta)?.pergunta_cidada || alerta.titulo;
}

// Resposta curta: a frase direta da IA quando existe; senão a narrativa consolidada.
function respostaCurta(alerta) {
  const d = discoveryV2(alerta);
  return d?.resposta_direta || d?.narrativa_consolidada || d?.hipotese_publica || alerta.narrativa || null;
}

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

// Ano da descoberta: metadado explícito ou ano do fim do período / publicação.
function anoDescoberta(alerta) {
  const anoMetadado = Number(alerta?.metadados?.ano);
  if (Number.isInteger(anoMetadado)) {
    return anoMetadado;
  }
  const dataFonte = alerta.periodo_fim || alerta.ultima_publicacao_documento || '';
  const m = String(dataFonte).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

// Agrupa por ano, mais recente primeiro. Sem ano por último.
function agruparPorAno(alertas) {
  const grupos = new Map();
  for (const a of alertas) {
    const ano = anoDescoberta(a);
    const chave = ano ?? 'sem-ano';
    if (!grupos.has(chave)) {
      grupos.set(chave, { ano, itens: [] });
    }
    grupos.get(chave).itens.push(a);
  }
  return [...grupos.values()].sort((x, y) => {
    if (x.ano === null) return 1;
    if (y.ano === null) return -1;
    return y.ano - x.ano;
  });
}

// Chips de tema vindos das categorias reais do acervo (nada hard-coded que
// possa mostrar filtro vazio). Ordena por volume e limita a MAX_CHIPS_TEMA.
function chipsTema(alertas) {
  const contagem = new Map();
  for (const a of alertas) {
    const cat = a.categoria || 'Geral';
    contagem.set(cat, (contagem.get(cat) || 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CHIPS_TEMA)
    .map(([categoria, count]) => ({ categoria, count }));
}

function NaLupaCard({ alerta }) {
  const resposta = respostaCurta(alerta);
  const metric = metricLabel(alerta);

  return (
    <Link href={`/na-lupa/${alerta.id}`} className={styles.card} data-nivel={alerta.severidade || 'info'}>
      <div className={styles.cardTop}>
        <span className={styles.tag}>{alerta.categoria || 'Geral'}</span>
        <span className={styles.nivel}>
          <span className={styles.nivelDot} />
          {nivelLabel(alerta.severidade)}
        </span>
      </div>

      <h3 className={styles.cardTitle}>{tituloCidadao(alerta)}</h3>

      {resposta ? <p className={styles.cardSummary}>{resposta}</p> : null}

      <div className={styles.cardFooter}>
        {metric ? (
          <span className={styles.value}>
            {metric}
            {alerta.valor_periodo_label ? (
              <span className={styles.valuePeriod}> · {alerta.valor_periodo_label}</span>
            ) : null}
          </span>
        ) : null}
        {alerta.documentos_ids?.length ? (
          <span className={styles.footMeta}>
            <IconDoc />
            {alerta.documentos_ids.length} doc{alerta.documentos_ids.length > 1 ? 's' : ''}
          </span>
        ) : null}
        {alerta.ultima_publicacao_documento ? (
          <span className={styles.footMeta}>
            <IconCalendar />
            {formatDate(alerta.ultima_publicacao_documento)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default async function NaLupaPage({ searchParams }) {
  const params = searchParams || {};
  const resultado = await fetchAlertas({
    status: 'ativo',
    pagina: 1,
    limite: 200,
  }).catch(() => ({ total: 0, dados: [] }));

  const todos = resultado.dados || [];
  const temas = chipsTema(todos);
  const temaAtivo = params.tema || null;
  const alertas = temaAtivo ? todos.filter((a) => (a.categoria || 'Geral') === temaAtivo) : todos;

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Ritápolis.com</span>
        <h1 className={styles.title}>Na Lupa</h1>
        <p className={styles.subtitle}>
          Gastos e contratos públicos que valem um segundo olhar. Analisamos os documentos para
          você: cada item traz o que foi encontrado, por que chama atenção e como pedir explicação
          à Prefeitura. Não é acusação — é ponto de partida para o cidadão fiscalizar.
        </p>
      </header>

      <nav className={styles.filters} aria-label="Filtrar por tema">
        <Link
          href="/na-lupa"
          className={`${styles.chip} ${!temaAtivo ? styles.chipActive : ''}`}
          aria-current={!temaAtivo ? 'page' : undefined}
        >
          Todos os temas
        </Link>
        {temas.map((t) => {
          const ativo = temaAtivo === t.categoria;
          return (
            <Link
              key={t.categoria}
              href={`/na-lupa?tema=${encodeURIComponent(t.categoria)}`}
              className={`${styles.chip} ${ativo ? styles.chipActive : ''}`}
              aria-current={ativo ? 'page' : undefined}
            >
              {t.categoria} <span className={styles.chipCount}>{t.count}</span>
            </Link>
          );
        })}
      </nav>

      {alertas.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nada neste tema por enquanto</p>
          <p>Escolha outro tema ou volte para todos.</p>
        </div>
      ) : (
        agruparPorAno(alertas).map((grupo) => (
          <section key={grupo.ano ?? 'sem-ano'} className={styles.yearSection}>
            <div className={styles.yearHead}>
              <h2 className={styles.yearTitle}>{grupo.ano ?? 'Sem ano'}</h2>
              <span className={styles.yearCount}>
                {grupo.itens.length} item{grupo.itens.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className={styles.grid}>
              {grupo.itens.map((alerta) => (
                <NaLupaCard key={alerta.id} alerta={alerta} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className={styles.count}>
        {alertas.length} item{alertas.length === 1 ? '' : 's'}
        {temaAtivo ? ` em "${temaAtivo}"` : ''}
      </p>
      <p className={styles.disclaimer}>{DISCLAIMER_DESCOBERTAS}</p>
    </main>
  );
}
