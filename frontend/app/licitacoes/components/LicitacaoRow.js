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

  return (
    <article className="licitacao-row">
      <div className="licitacao-main">
        <div className="document-row-meta">
          <span>{item.fonte_nome || labelFonte(item.fonte)}</span>
          <span>{modalidade}</span>
          <span>{processo}</span>
          <span>Sessao: {formatDate(dataSessao, 'Nao identificada')}</span>
        </div>
        <h2>
          <Link href={`/documento/${item.id}`}>{item.numero || item.titulo}</Link>
        </h2>
        <p>{objeto}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <CategoriaBadge categoria={item.categoria_inteligencia} />
          <QualitySignals documento={item} compact />
        </div>
        <div className="document-row-meta">
          <span>{correlacao.tem_grupo ? `Grupo: ${correlacao.grupo_total_documentos} publicacoes` : 'Sem grupo multiplo'}</span>
          <span>{correlacao.tem_pncp ? `PNCP: ${correlacao.pncp_fontes_total}` : 'Sem PNCP'}</span>
          <span>{correlacao.tem_leitura_integrada ? 'Leitura integrada' : 'Sem leitura integrada'}</span>
        </div>
      </div>
      <div className="licitacao-side">
        <div className="document-row-field">
          <span>Valor estimado</span>
          <strong>{formatMoney(modelo.valor_estimado ?? item.valor_estimado)}</strong>
        </div>
        <div className="document-row-field">
          <span>Valor final</span>
          <strong>{formatMoney(detalhes.valor_final)}</strong>
        </div>
        {detalhes.vencedor_nome && (
          <div className="document-row-field">
            <span>Vencedor</span>
            <strong style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: 'var(--success)' }}>
              {detalhes.vencedor_nome}
            </strong>
          </div>
        )}
        <div className="document-row-field">
          <span>Arquivos</span>
          <strong>{anexosLabel}</strong>
        </div>
        <div className="document-row-field">
          <span>Produtos</span>
          <strong>{produtos.total ? `${produtos.total} item${produtos.total === 1 ? '' : 's'}` : 'Sem itens'}</strong>
        </div>
        <StatusBadge value={detalhes.status || item.status_coleta} />
      </div>
    </article>
  );
}
