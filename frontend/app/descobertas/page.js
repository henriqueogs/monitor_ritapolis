import Link from 'next/link';
import { fetchAlertas } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import { nivelLabel } from '../lib/descobertas';
import { DISCLAIMER_DESCOBERTAS } from '../lib/disclaimer';
import styles from './styles.module.css';

export const metadata = {
  title: 'Descobertas',
  description: 'Curiosidades e padrões encontrados nos documentos públicos de Ritápolis/MG.',
};

const FILTROS = [
  { href: '/descobertas', label: 'Todas' },
  { href: '/descobertas?severidade=critico', label: 'Merece atenção', nivel: 'critico' },
  { href: '/descobertas?severidade=atencao', label: 'Vale conferir', nivel: 'atencao' },
  { href: '/descobertas?severidade=info', label: 'Curiosidades', nivel: 'info' },
  { href: '/descobertas?tipo=tematico', label: 'Padrões' },
  { href: '/descobertas?tipo=processo', label: 'Por processo' },
];

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

function investigationLabel(alerta) {
  const tipo = alerta?.metadados?.discovery_v2?.tipo_investigacao || alerta?.metadados?.investigacao_tipo;
  const labels = {
    'meio_ambiente.supressao_arvores': 'meio ambiente',
    supressao_arvores: 'meio ambiente',
    'compras.precos_itens': 'compras/precos',
    'contratos.recorrencia_fornecedor_objeto': 'contratos',
    'eventos.gastos_eventos_publicos': 'eventos',
  };
  return labels[tipo] || tipo || null;
}

// Ano da descoberta: 3ª parte da chave (tematico|cat|2026) ou ano do fim do
// período / última publicação. Sem ano → null (vai pro fim).
function anoDescoberta(alerta) {
  const daChave = String(alerta.chave_unica || '').split('|')[2];
  if (/^\d{4}$/.test(daChave)) {
    return Number(daChave);
  }
  const dataFonte = alerta.periodo_fim || alerta.ultima_publicacao_documento || '';
  const m = String(dataFonte).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

// Agrupa por ano, mais recente primeiro (ano corrente no topo). Sem ano por último.
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

function chipAtivo(filtro, params) {
  if (filtro.nivel) {
    return params.severidade === filtro.nivel;
  }
  if (filtro.href.includes('tipo=tematico')) {
    return params.tipo === 'tematico';
  }
  if (filtro.href.includes('tipo=processo')) {
    return params.tipo === 'processo';
  }
  return !params.severidade && !params.tipo;
}

function DescobertaCard({ alerta }) {
  const discovery = discoveryV2(alerta);
  const summary = discovery?.narrativa_consolidada || discovery?.hipotese_publica || alerta.narrativa;
  const lacunas = discovery?.lacunas_encontradas || [];
  const metric = metricLabel(alerta);
  const investigation = investigationLabel(alerta);

  return (
    <Link
      href={`/descobertas/${alerta.id}`}
      className={styles.card}
      data-nivel={alerta.severidade || 'info'}
    >
      <div className={styles.cardTop}>
        <span className={styles.nivel}>
          <span className={styles.nivelDot} />
          {nivelLabel(alerta.severidade)}
        </span>
        <span className={styles.tag}>{alerta.categoria || 'Geral'}</span>
        {investigation ? <span className={styles.tag}>{investigation}</span> : null}
        <span className={styles.tagSep}>•</span>
        <span className={styles.tag}>{alerta.tipo === 'processo' ? 'por processo' : 'padrão'}</span>
      </div>

      <h3 className={styles.cardTitle}>{alerta.titulo}</h3>

      {summary ? <p className={styles.cardSummary}>{summary}</p> : null}

      {lacunas.length ? (
        <div className={styles.lacunaPreview}>
          <span>{lacunas.length} lacuna{lacunas.length === 1 ? '' : 's'} nos documentos analisados</span>
          <small>{lacunas[0]}</small>
        </div>
      ) : null}

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

export default async function DescobertasPage({ searchParams }) {
  const params = searchParams || {};
  const resultado = await fetchAlertas({
    tipo: params.tipo || undefined,
    categoria: params.categoria || undefined,
    severidade: params.severidade || undefined,
    status: params.status || 'ativo',
    pagina: params.pagina || 1,
    limite: params.limite || 200,
  }).catch(() => ({ total: 0, dados: [], pagina: 1, limite: 200 }));

  const alertas = resultado.dados || [];

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Ritápolis.com</span>
        <h1 className={styles.title}>Descobertas nos dados</h1>
        <p className={styles.subtitle}>
          Curiosidades e padrões que a análise encontrou nos documentos públicos. São pontos para
          explorar e entender — a maioria é perfeitamente normal. O objetivo é dar visibilidade, não
          alarmar.
        </p>
        <p className={styles.disclaimer}>{DISCLAIMER_DESCOBERTAS}</p>
      </header>

      <nav className={styles.filters} aria-label="Filtrar descobertas">
        {FILTROS.map((f) => {
          const ativo = chipAtivo(f, params);
          return (
            <Link
              key={f.href}
              href={f.href}
              className={`${styles.chip} ${ativo ? styles.chipActive : ''}`}
              aria-current={ativo ? 'page' : undefined}
            >
              {f.nivel ? <span className={styles.chipDot} data-nivel={f.nivel} /> : null}
              {f.label}
            </Link>
          );
        })}
      </nav>

      {alertas.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nenhuma descoberta por aqui</p>
          <p>Nenhum padrão corresponde a este filtro no momento.</p>
        </div>
      ) : (
        agruparPorAno(alertas).map((grupo) => (
          <section key={grupo.ano ?? 'sem-ano'} className={styles.yearSection}>
            <div className={styles.yearHead}>
              <h2 className={styles.yearTitle}>{grupo.ano ?? 'Sem ano'}</h2>
              <span className={styles.yearCount}>
                {grupo.itens.length} descoberta{grupo.itens.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className={styles.grid}>
              {grupo.itens.map((alerta) => (
                <DescobertaCard key={alerta.id} alerta={alerta} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className={styles.count}>
        {resultado.total} descoberta{resultado.total === 1 ? '' : 's'}
      </p>
    </main>
  );
}
