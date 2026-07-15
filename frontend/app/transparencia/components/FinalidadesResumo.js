import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import FinalidadeBadge from '../../components/FinalidadeBadge';
import { formatMoney } from '../../lib/format';

const TONE_COLOR = {
  gov: 'var(--accent)',
  servidor: 'var(--warning)',
  entidade: 'var(--success)',
  pessoal: 'var(--text-secondary)',
  auxilio: 'var(--warning)',
  servico: 'var(--ai-accent)',
  investimento: 'var(--demo)',
  neutro: 'var(--text-muted)',
};

const META = {
  ordem_pagamento: { rotulo: 'Ordem de pagamento', tom: 'neutro', descricao: 'Pagamento de despesa já empenhada.' },
  licitacao: { rotulo: 'Licitação', tom: 'gov', descricao: 'Empenhos vinculados a processo ou modalidade licitatória.' },
  diaria_servidor: { rotulo: 'Diária', tom: 'servidor', descricao: 'Diárias e deslocamentos de servidores/agentes.' },
  transferencia_entidade: { rotulo: 'Entidade', tom: 'entidade', descricao: 'Repasses, subvenções e convênios com entidades.' },
  pessoal_encargos: { rotulo: 'Folha', tom: 'pessoal', descricao: 'Folha, vencimentos e encargos de pessoal.' },
  auxilio_pf: { rotulo: 'Auxílio', tom: 'auxilio', descricao: 'Apoios financeiros a pessoa física.' },
  servico_pf: { rotulo: 'Serviço PF', tom: 'servico', descricao: 'Serviços contratados de pessoa física.' },
  servico_pj_sem_licitacao: { rotulo: 'Serviço PJ', tom: 'servico', descricao: 'Serviços PJ sem licitação vinculada na base.' },
  investimento: { rotulo: 'Investimento', tom: 'investimento', descricao: 'Obras, equipamentos e outros investimentos.' },
  outros: { rotulo: 'Outros', tom: 'neutro', descricao: 'Empenhos sem regra específica.' },
};

function normalizarFinalidade(row) {
  const classe = row.classe || row.classe_principal;
  const meta = META[classe] || META.outros;
  return {
    classe,
    rotulo: row.rotulo || meta.rotulo,
    tom: row.tom || meta.tom,
    descricao: row.descricao || meta.descricao,
    n: Number(row.n || row.n_empenhos || 0),
    valor_total: Number(row.valor_total || row.valor || 0),
  };
}

function compactMoney(valor) {
  const numero = Number(valor || 0);
  if (numero >= 1_000_000) {
    return `R$ ${(numero / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (numero >= 1_000) {
    return `R$ ${(numero / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  }
  return formatMoney(numero);
}

function finalidadeUrl(item, sufixo) {
  return `/transparencia/finalidades/${item.classe}${sufixo}`;
}

function filtroUrl(basePath, item, queryPeriodo) {
  return `${basePath}?finalidade=${item.classe}${queryPeriodo ? `&${queryPeriodo}` : ''}`;
}

function TopFinalidadeCard({ item, index, total, sufixo, queryPeriodo }) {
  const pctTotal = total ? Math.round((item.valor_total / total) * 100) : 0;
  return (
    <article
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 14,
        background: index === 0 ? 'var(--accent-soft-2)' : 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <FinalidadeBadge finalidade={item} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{pctTotal}%</span>
      </div>
      <Link href={finalidadeUrl(item, sufixo)} style={{ display: 'block', marginTop: 10, color: 'inherit', textDecoration: 'none' }}>
        <strong style={{ display: 'block', fontSize: 16 }}>{item.rotulo}</strong>
        <span style={{ display: 'block', marginTop: 5, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {item.descricao}
        </span>
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginTop: 14 }}>
        <span>
          <strong style={{ display: 'block', fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
            {compactMoney(item.valor_total)}
          </strong>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {item.n.toLocaleString('pt-BR')} empenhos
          </span>
        </span>
        <Link
          href={filtroUrl('/transparencia/empenhos', item, queryPeriodo)}
          style={{
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-muted)',
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Empenhos
        </Link>
      </div>
    </article>
  );
}

function OutrasFinalidades({ itens, total, sufixo, queryPeriodo }) {
  if (!itens.length) { return null; }
  return (
    <div>
      <h3 style={{ margin: '2px 0 10px', fontSize: 14 }}>Outras finalidades</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {itens.map((item) => {
          const pctTotal = total ? Math.round((item.valor_total / total) * 100) : 0;
          const pctBarra = total ? Math.max(3, Math.round((item.valor_total / total) * 100)) : 0;
          return (
            <div
              key={item.classe}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
                alignItems: 'center',
                padding: '9px 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <Link href={finalidadeUrl(item, sufixo)} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FinalidadeBadge finalidade={item} />
                  <strong style={{ fontSize: 13 }}>{item.rotulo}</strong>
                </span>
              </Link>
              <div style={{ minWidth: 0 }}>
                <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pctBarra}%`,
                      height: '100%',
                      background: TONE_COLOR[item.tom] || TONE_COLOR.neutro,
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  {pctTotal}% do valor - {item.n.toLocaleString('pt-BR')} empenhos
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ display: 'block', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                  {compactMoney(item.valor_total)}
                </strong>
                <Link href={filtroUrl('/credores', item, queryPeriodo)} style={{ fontSize: 11 }}>
                  Credores
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FinalidadesResumo({ finalidades, periodoLabel, queryPeriodo }) {
  const lista = (finalidades || []).map(normalizarFinalidade).filter((item) => item.classe);
  if (!lista.length) { return null; }

  const total = lista.reduce((acc, item) => acc + item.valor_total, 0);
  const totalEmpenhos = lista.reduce((acc, item) => acc + item.n, 0);
  const topFinalidades = lista.slice(0, 3);
  const demais = lista.slice(3);
  const segmentos = lista.slice(0, 6);
  const destaque = topFinalidades[0];
  const sufixo = queryPeriodo ? `?${queryPeriodo}` : '';

  return (
    <SectionBlock
      title={`Para onde foi o dinheiro (${periodoLabel})`}
      description="Resumo por finalidade do empenho. Primeiro os maiores destinos, depois as demais classes em lista compacta."
      aside={
        <Link href={`/transparencia/finalidades${sufixo}`} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
          Ver todas as finalidades
        </Link>
      }
    >
      <div style={{ display: 'grid', gap: 18 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
            alignItems: 'center',
          }}
        >
          <div>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Maior finalidade
            </span>
            <strong style={{ display: 'block', marginTop: 4, fontSize: '1.35rem', lineHeight: 1.2 }}>
              {destaque.rotulo}
            </strong>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {Math.round((destaque.valor_total / total) * 100)}% do valor classificado no período,
              em {destaque.n.toLocaleString('pt-BR')} empenhos.
            </p>
          </div>

          <div>
            <div
              aria-label={`Composição por finalidade no período ${periodoLabel}`}
              role="img"
              style={{
                display: 'flex',
                height: 18,
                borderRadius: 'var(--radius-pill)',
                overflow: 'hidden',
                background: 'var(--surface-muted)',
                boxShadow: 'inset 0 0 0 1px var(--border)',
              }}
            >
              {segmentos.map((item) => {
                const pct = total ? Math.max(2, Math.round((item.valor_total / total) * 100)) : 0;
                return (
                  <span
                    key={item.classe}
                    title={`${item.rotulo}: ${formatMoney(item.valor_total)}`}
                    style={{
                      width: `${pct}%`,
                      minWidth: pct > 0 ? 10 : 0,
                      background: TONE_COLOR[item.tom] || TONE_COLOR.neutro,
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {totalEmpenhos.toLocaleString('pt-BR')} empenhos classificados
              </span>
              <strong style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {topFinalidades.map((item, index) => (
            <TopFinalidadeCard
              key={item.classe}
              item={item}
              index={index}
              total={total}
              sufixo={sufixo}
              queryPeriodo={queryPeriodo}
            />
          ))}
        </div>

        <OutrasFinalidades itens={demais} total={total} sufixo={sufixo} queryPeriodo={queryPeriodo} />
      </div>
    </SectionBlock>
  );
}
