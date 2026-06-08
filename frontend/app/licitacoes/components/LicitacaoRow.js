import Link from 'next/link';
import QualitySignals from '../../components/QualitySignals';
import CategoriaBadge from '../../components/CategoriaBadge';
import StatusBadge from '../../components/StatusBadge';
import { formatDate, formatMoney, labelFonte } from '../../lib/format';

export default function LicitacaoRow({ item }) {
  const modelo = item.licitacao_modelo || {};
  const detalhes = item.licitacao_detalhes || {};
  const produtos = item.produtos_licitados_resumo || {};
  const correlacao = item.correlacao_resumo || {};
  const modalidade = modelo.modalidade || detalhes.modalidade || 'Edital';
  const processo = modelo.processo || item.numero || 'Processo nao identificado';
  const objeto = modelo.objeto || item.resumo || 'Objeto ainda nao identificado.';
  const dataSessao = modelo.data_sessao || item.data_abertura;
  const anexosLabel = modelo.anexos_total
    ? `${modelo.anexos_total} arquivo${modelo.anexos_total === 1 ? '' : 's'}`
    : 'Sem arquivo identificado';

  const valorExibido = detalhes.valor_final ?? (modelo.valor_estimado ?? item.valor_estimado);
  const labelValor = detalhes.valor_final != null ? 'Valor final' : 'Valor estimado';
  const badges = [
    correlacao.tem_grupo && `${correlacao.grupo_total_documentos} publicações`,
    correlacao.tem_leitura_integrada && 'Análise do processo',
  ].filter(Boolean);

  return (
    <article className="licitacao-row">
      <div className="licitacao-main">
        <div className="document-row-meta">
          <span>{item.fonte_nome || labelFonte(item.fonte)}</span>
          <span>{modalidade}</span>
          <span>{processo}</span>
          <span>{formatDate(dataSessao, '')}</span>
        </div>
        <h2>
          <Link href={`/documento/${item.id}`}>{item.numero || item.titulo}</Link>
        </h2>
        <p>{objeto}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <CategoriaBadge categoria={item.categoria_inteligencia} />
          <QualitySignals documento={item} compact />
          {badges.map((b) => (
            <span key={b} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-muted)', padding: '2px 6px', borderRadius: 4 }}>{b}</span>
          ))}
        </div>
      </div>
      <div className="licitacao-side">
        {valorExibido != null && (
          <div className="document-row-field">
            <span>{labelValor}</span>
            <strong>{formatMoney(valorExibido)}</strong>
          </div>
        )}
        {detalhes.vencedor_nome && (
          <div className="document-row-field">
            <span>Vencedor</span>
            <strong style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
              {detalhes.vencedor_nome}
            </strong>
          </div>
        )}
        <StatusBadge value={detalhes.status || item.status_coleta} />
      </div>
    </article>
  );
}
