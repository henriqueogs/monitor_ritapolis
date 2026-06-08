import { formatMoney } from '../../lib/format';

function percent(part, total) {
  if (!total) return '0%';
  return `${Math.round((Number(part || 0) / Number(total)) * 100)}%`;
}

function originLabel(value) {
  const labels = {
    ia_resumo: 'Extraido por IA',
    texto_tabela: 'Tabela oficial',
    ata_resultado: 'Ata de resultado',
    'texto_tabela+ata_resultado': 'Tabela oficial + ata',
    'ia_resumo+ata_resultado': 'IA + ata',
    oficial: 'Dado oficial coletado',
    integracao: 'Validado por integracao'
  };

  return labels[value] || value || 'Origem nao informada';
}

function StatRow({ label, value, note }) {
  return (
    <div className="product-stat-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{note}</em>
    </div>
  );
}

export default function LicitacaoProductSummary({ analise }) {
  const produtos = analise?.produtos || {};
  const licitacoes = analise?.licitacoes || {};
  const totalProdutos = Number(produtos.total || 0);
  const totalLoteGlobal =
    Number(produtos.valor_lote_total_identificado || 0) +
    Number(produtos.valor_global_total_identificado || 0);

  return (
    <section className="product-summary-block" aria-label="Resumo dos produtos licitados">
      <div className="product-summary-main">
        <StatRow
          label="Produtos estruturados"
          value={totalProdutos}
          note={`${produtos.documentos_com_produtos || 0} de ${licitacoes.total || 0} licitacoes`}
        />
        <StatRow
          label="Com preco estimado"
          value={percent(produtos.com_preco_estimado, totalProdutos)}
          note={`${produtos.com_preco_estimado || 0} produto(s)`}
        />
        <StatRow
          label="Com preco final"
          value={percent(produtos.com_preco_final, totalProdutos)}
          note={`${produtos.com_preco_final || 0} produto(s)`}
        />
        <StatRow
          label="Com fornecedor"
          value={percent(produtos.com_fornecedor, totalProdutos)}
          note={`${produtos.com_fornecedor || 0} produto(s)`}
        />
      </div>

      <div className="product-summary-side">
        <div>
          <span>Valores identificados</span>
          <strong>{formatMoney(produtos.valor_estimado_total_identificado)}</strong>
          <p>
            final calculavel {formatMoney(produtos.valor_final_total_identificado)}
            {totalLoteGlobal ? `; lote/global ${formatMoney(totalLoteGlobal)}` : ''}
          </p>
        </div>
        <div>
          <span>Validacao de valores</span>
          <strong>{produtos.sem_validacao || 0} pendente(s)</strong>
          <p>{analise?.validacoes?.length ? 'Ha validacoes registradas' : 'Aguardando consistencia ou integracao'}</p>
        </div>
      </div>

      {analise?.origens?.length ? (
        <div className="product-origin-line">
          {analise.origens.map((item) => (
            <span key={item.origem}>{originLabel(item.origem)}: {item.produtos}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
