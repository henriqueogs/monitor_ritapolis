import Link from 'next/link';
import { fetchEmendas, fetchEmendaTotaisPorAno, fetchEmendaParlamentares } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import styles from './styles.module.css';

export const metadata = {
  title: 'Emendas Parlamentares',
  description: 'Emendas parlamentares estaduais e federais recebidas por Ritápolis'
};

function RangeAnos({ totais }) {
  if (!totais || totais.length === 0) return null;
  const anos = totais.map((t) => t.ano).filter(Boolean);
  if (anos.length === 0) return null;
  const min = Math.min(...anos);
  const max = Math.max(...anos);
  return min === max ? String(min) : `${min}–${max}`;
}

function TotaisCards({ totais }) {
  if (!totais || totais.length === 0) return null;

  // Agrupa por esfera para somar
  const porEsfera = {};
  for (const t of totais) {
    const esfera = t.esfera || 'indefinida';
    if (!porEsfera[esfera]) { porEsfera[esfera] = { total_emendas: 0, soma_repasse: 0, anos: [] }; }
    porEsfera[esfera].total_emendas += t.total_emendas || 0;
    porEsfera[esfera].soma_repasse += t.soma_repasse || 0;
    if (t.ano) { porEsfera[esfera].anos.push(t.ano); }
  }

  const range = <RangeAnos totais={totais} />;

  return (
    <div className={styles.totaisGrid}>
      {Object.entries(porEsfera).map(([esfera, dados]) => {
        const label = esfera === 'estadual' ? 'Estaduais' : esfera === 'federal' ? 'Federais' : 'Outras';
        const anosLocal = [...new Set(dados.anos)].sort();
        const rangeLocal = anosLocal.length > 1
          ? `${anosLocal[0]}–${anosLocal[anosLocal.length - 1]}`
          : anosLocal[0] || '';
        return (
          <div key={esfera} className={styles.totaisCard}>
            <span className={styles.totaisLabel}>Emendas {label}</span>
            <span className={styles.totaisValor}>{formatMoney(dados.soma_repasse)}</span>
            <span className={styles.totaisPeriodo}>Total recebido {rangeLocal}</span>
            <span className={styles.totaisQtd}>{dados.total_emendas} emenda{dados.total_emendas !== 1 ? 's' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function BadgeEsfera({ esfera }) {
  if (!esfera) return null;
  const label = esfera === 'estadual' ? 'Estadual' : esfera === 'federal' ? 'Federal' : esfera;
  return <span className={`${styles.badge} ${styles[`badge_${esfera}`]}`}>{label}</span>;
}

function EmendaCard({ emenda }) {
  const valor = emenda.valor_repasse != null
    ? formatMoney(emenda.valor_repasse)
    : 'Valor não informado';

  const ano = emenda.ano || (emenda.data_inicio ? emenda.data_inicio.slice(0, 4) : null);

  // Fonte às vezes despeja o registro inteiro em cargo/partido (260+ chars).
  // Cargo real é curto ("Deputado Federal"); ignora quando vier poluído.
  const cargo =
    emenda.cargo_parlamentar && emenda.cargo_parlamentar.length <= 40
      ? emenda.cargo_parlamentar
      : null;
  const partido = emenda.partido && emenda.partido.length <= 20 ? emenda.partido : null;
  // instrumento_legal / unidade_executora também vêm poluídos com o registro
  // inteiro às vezes — só exibe quando curto o bastante para ser o valor real.
  const instrumentoLegal =
    emenda.instrumento_legal && emenda.instrumento_legal.length <= 80 ? emenda.instrumento_legal : null;
  const unidadeExecutora =
    emenda.unidade_executora && emenda.unidade_executora.length <= 80 ? emenda.unidade_executora : null;

  return (
    <article className={styles.emendaCard}>
      <header className={styles.emendaCardHeader}>
        <div className={styles.emendaCardMeta}>
          <BadgeEsfera esfera={emenda.esfera} />
          {partido && <span className={styles.badgePartido}>{partido}</span>}
          {ano && <span className={styles.badgeAno}>{ano}</span>}
        </div>
        <h3 className={styles.emendaCardTitulo}>
          {emenda.nome_parlamentar || emenda.titulo || 'Emenda parlamentar'}
          {cargo && <span className={styles.emendaCardCargo}> — {cargo}</span>}
        </h3>
      </header>

      <div className={styles.emendaCardValor}>
        <span className={styles.emendaCardValorLabel}>Valor do repasse</span>
        <strong className={styles.emendaCardValorNum}>{valor}</strong>
        {ano && <span className={styles.emendaCardValorAno}>{ano}</span>}
      </div>

      {emenda.objeto && (
        <p className={styles.emendaCardObjeto}>{emenda.objeto}</p>
      )}

      <footer className={styles.emendaCardFooter}>
        {instrumentoLegal && (
          <span className={styles.emendaCardLegal}>{instrumentoLegal}</span>
        )}
        {unidadeExecutora && (
          <span className={styles.emendaCardExecutora}>{unidadeExecutora}</span>
        )}
        {emenda.id && (
          <Link href={`/documento/${emenda.id}`} className={styles.emendaCardFonte}>
            Ver detalhes →
          </Link>
        )}
        {emenda.url_origem && (
          <a
            href={emenda.url_origem}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.emendaCardFonte}
          >
            Abrir fonte oficial ↗
          </a>
        )}
        {emenda.url_pdf && (
          <a
            href={emenda.url_pdf}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.emendaCardPdf}
          >
            Ver PDF ↗
          </a>
        )}
      </footer>
    </article>
  );
}

function FiltrosForm({ esferaAtual, anoAtual, parlamentarAtual }) {
  return (
    <form method="GET" className={styles.filtrosForm}>
      <label className={styles.filtroField}>
        <span>Esfera</span>
        <select name="esfera" defaultValue={esferaAtual || ''} className={styles.filtroSelect}>
          <option value="">Todas as esferas</option>
          <option value="estadual">Estadual</option>
          <option value="federal">Federal</option>
        </select>
      </label>
      <label className={styles.filtroField}>
        <span>Ano</span>
        <input
          type="number"
          name="ano"
          defaultValue={anoAtual || ''}
          placeholder="Ex.: 2026"
          min="2020"
          max="2030"
          className={styles.filtroInput}
        />
      </label>
      <label className={styles.filtroField}>
        <span>Parlamentar</span>
        <input
          type="text"
          name="parlamentar"
          defaultValue={parlamentarAtual || ''}
          placeholder="Nome do parlamentar"
          className={styles.filtroInput}
        />
      </label>
      <div className={styles.filtroActions}>
        <button type="submit" className={styles.filtroBtn}>Filtrar</button>
        <Link href="/emendas" className={styles.filtroClear}>Limpar</Link>
      </div>
    </form>
  );
}

export default async function EmendasPage(props) {
  const searchParams = await props.searchParams;
  const esfera = searchParams?.esfera || undefined;
  const ano = searchParams?.ano || undefined;
  const parlamentar = searchParams?.parlamentar || undefined;

  const [{ emendas, total }, totais] = await Promise.all([
    fetchEmendas({ esfera, ano, parlamentar, limite: 50 }),
    fetchEmendaTotaisPorAno(),
  ]);

  const anosDisponiveis = [...new Set(totais.map((t) => t.ano).filter(Boolean))].sort((a, b) => b - a);

  return (
    <main className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Emendas Parlamentares</h1>
        <p className={styles.pageSubtitle}>
          Recursos destinados a Ritápolis por parlamentares estaduais e federais
        </p>
      </div>

      <TotaisCards totais={totais} />

      <section className={styles.filtrosSection} aria-labelledby="emendas-filtros-title">
        <div className={styles.filtrosHeader}>
          <div>
            <h2 id="emendas-filtros-title" className={styles.filtrosTitle}>Filtrar emendas</h2>
            <p className={styles.filtrosSubtitle}>Refine por esfera, ano ou parlamentar.</p>
          </div>
        </div>
        <FiltrosForm esferaAtual={esfera} anoAtual={ano} parlamentarAtual={parlamentar} />
        {total > 0 && (
          <p className={styles.resultadoCount}>
            {total} emenda{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
            {esfera ? ` (${esfera})` : ''}
            {ano ? ` em ${ano}` : ''}
          </p>
        )}
      </section>

      {emendas.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Nenhuma emenda encontrada com os filtros selecionados.</p>
        </div>
      ) : (
        <section className={styles.emendasGrid}>
          {emendas.map((emenda) => (
            <EmendaCard key={emenda.id} emenda={emenda} />
          ))}
        </section>
      )}

      <footer className={styles.fonteRodape}>
        <p>
          Fonte:{' '}
          <a
            href="https://ritapolis.mg.gov.br/pagina/21642/emendas-parlamentares-estaduais"
            target="_blank"
            rel="noopener noreferrer"
          >
            Portal da Prefeitura de Ritápolis — Emendas Parlamentares Estaduais
          </a>
          {' '}e{' '}
          <a
            href="https://ritapolis.mg.gov.br/pagina/21947/emendas-parlamentares-federais"
            target="_blank"
            rel="noopener noreferrer"
          >
            Emendas Parlamentares Federais
          </a>
        </p>
      </footer>
    </main>
  );
}
