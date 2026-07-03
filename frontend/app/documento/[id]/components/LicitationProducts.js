import SectionBlock from '../../../components/SectionBlock';
import { formatMoney } from '../../../lib/format';

// Item não pode custar mais que o processo inteiro (folga de arredondamento).
// Espelha o gate do backend (src/licitacoes/valores.js).
const FATOR_MAX_ITEM_VS_PROCESSO = 1.05;

function bestEstimatedValue(item) {
  if (item.valor_total_estimado != null) return item.valor_total_estimado;
  if (item.valor_unitario_estimado != null && item.quantidade != null) {
    return Number(item.valor_unitario_estimado) * Number(item.quantidade);
  }
  return item.valor_unitario_estimado;
}

// Valor final pra exibição, protegido: nunca "inventa" um total unit×qtd que
// excederia o valor final do processo — nesses casos mostra o unitário cru.
function bestFinalValue(item, valorFinalProcesso) {
  if (item.valor_total_final != null) return { valor: item.valor_total_final, label: 'Final total' };
  if (item.valor_lote_final != null) return { valor: item.valor_lote_final, label: 'Final lote' };
  if (item.valor_global_final != null) return { valor: item.valor_global_final, label: 'Final global' };
  if (item.valor_unitario_final != null && item.quantidade != null) {
    const calculado = Number(item.valor_unitario_final) * Number(item.quantidade);
    const excede =
      valorFinalProcesso > 0 && calculado > valorFinalProcesso * FATOR_MAX_ITEM_VS_PROCESSO;
    if (excede) return { valor: item.valor_unitario_final, label: 'Final unitario' };
    return { valor: calculado, label: 'Final calculado' };
  }
  if (item.valor_unitario_final != null) return { valor: item.valor_unitario_final, label: 'Final unitario' };
  return null;
}

function somaFinaisItens(itens, valorFinalProcesso) {
  let soma = 0;
  for (const item of itens) {
    const final = bestFinalValue(item, valorFinalProcesso);
    if (final?.valor != null) soma += Number(final.valor);
  }
  return {
    soma,
    excedeProcesso: valorFinalProcesso > 0 && soma > valorFinalProcesso * FATOR_MAX_ITEM_VS_PROCESSO,
  };
}

// Item "útil" tem ao menos um dado concreto além da descrição: quantidade,
// fornecedor ou algum valor. Os demais (só descrição) colapsam — não enchem a
// tela de "Não informado".
function temDadoUtil(item) {
  return (
    item.quantidade != null ||
    Boolean(item.fornecedor_nome) ||
    bestEstimatedValue(item) != null ||
    bestFinalValue(item) != null
  );
}

// Valor da fonte que caiu na quarentena — mostrado dentro do aviso, não como "Final"
function valorQuarentenado(item) {
  return (
    item.valor_lote_final ?? item.valor_global_final ?? item.valor_total_final ?? item.valor_unitario_final
  );
}

// Link pra fonte de onde o valor realmente veio: a ata (anexo), não o edital.
function LinkFonteDoValor({ item, rotulo = 'Conferir na ata de origem' }) {
  if (item.anexo_origem_id) {
    return <a href={`/anexo/${item.anexo_origem_id}`}>{rotulo} →</a>;
  }
  const urlFonte = item.documento_url_pdf || item.documento_url_origem;
  if (!urlFonte) {return null;}
  return (
    <a href={urlFonte} target="_blank" rel="noopener noreferrer">
      Conferir na fonte oficial ↗
    </a>
  );
}

function AvisoValorInconsistente({ item, valorFinalProcesso }) {
  const valorFonte = valorQuarentenado(item);
  const valorProcesso = item.plausibilidade_valor_processo ?? valorFinalProcesso;

  return (
    <div className="document-row-field" style={{ maxWidth: 300 }}>
      <span style={{ color: 'var(--warning)' }}>Valor não confiável</span>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        A ata registra {valorFonte != null ? formatMoney(valorFonte) : 'um valor'} para este item —
        acima do valor final homologado do processo
        {valorProcesso ? ` (${formatMoney(valorProcesso)})` : ''}. <LinkFonteDoValor item={item} />
      </p>
    </div>
  );
}

// Registro de preços: o valor é teto homologado por lote, não gasto — exibe
// com contexto pra não parecer que a Prefeitura gastou milhões.
function NotaTetoHomologado({ item, final }) {
  const empenhado = item.plausibilidade_valor_processo;
  return (
    <div className="document-row-field" style={{ maxWidth: 300 }}>
      <span>{final.label} (teto homologado)</span>
      <strong>{formatMoney(final.valor)}</strong>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Teto homologado na ata — não é gasto realizado
        {empenhado ? `; o processo tem ${formatMoney(empenhado)} empenhados até agora` : ''}.{' '}
        <LinkFonteDoValor item={item} />
      </p>
    </div>
  );
}

function ProductRow({ item, valorFinalProcesso }) {
  const estimado = bestEstimatedValue(item);
  const quarentenado = Boolean(item.valor_final_quarentenado);
  const contextoEmpenho = Boolean(item.valor_final_contexto_empenho);
  const final = quarentenado ? null : bestFinalValue(item, valorFinalProcesso);
  const lote = item.lote_numero ? `Lote ${item.lote_numero}` : null;
  const itemNum = item.item_numero ? `Item ${item.item_numero}` : null;

  return (
    <article className="product-row">
      <div className="product-row-main">
        {lote || itemNum ? (
          <div className="document-row-meta">
            {lote ? <span>{lote}</span> : null}
            {itemNum ? <span>{itemNum}</span> : null}
          </div>
        ) : null}
        <h3>{item.descricao}</h3>
        {item.quantidade != null ? (
          <p>
            Quantidade {item.quantidade}
            {item.unidade ? ` ${item.unidade}` : ''}
          </p>
        ) : null}
        {item.trecho_fonte ? <span className="product-source-line admin-only">{item.trecho_fonte}</span> : null}
      </div>
      <div className="product-row-side">
        {estimado != null ? (
          <div className="document-row-field">
            <span>Estimado</span>
            <strong>{formatMoney(estimado)}</strong>
          </div>
        ) : null}
        {quarentenado ? (
          <AvisoValorInconsistente item={item} valorFinalProcesso={valorFinalProcesso} />
        ) : contextoEmpenho && final ? (
          <NotaTetoHomologado item={item} final={final} />
        ) : final ? (
          <div className="document-row-field">
            <span>{final.label}</span>
            <strong>{formatMoney(final.valor)}</strong>
          </div>
        ) : null}
        {item.fornecedor_nome ? (
          <div className="document-row-field">
            <span>Fornecedor</span>
            <strong>{item.fornecedor_nome}</strong>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function LicitationProducts({ produtos, valorFinalProcesso }) {
  const itens = produtos?.dados || [];

  if (!itens.length) {
    return (
      <SectionBlock
        title="Itens deste processo"
        description="Produtos, precos e fornecedores citados nos documentos, quando a fonte oficial informa."
      >
        <p className="empty-state">Nenhum item estruturado para este documento.</p>
      </SectionBlock>
    );
  }

  const comDados = itens.filter(temDadoUtil);
  const semDados = itens.filter((item) => !temDadoUtil(item));
  // Tetos homologados (registro de preços) ficam fora da soma do banner —
  // somá-los contra o valor empenhado geraria alarme falso.
  const naoQuarentenados = comDados.filter(
    (item) => !item.valor_final_quarentenado && !item.valor_final_contexto_empenho
  );
  const { soma, excedeProcesso } = somaFinaisItens(naoQuarentenados, valorFinalProcesso);

  return (
    <SectionBlock
      title="Itens deste processo"
      description="Produtos, precos e fornecedores citados nos documentos, quando a fonte oficial informa."
    >
      {excedeProcesso ? (
        <p
          style={{
            margin: '0 0 14px', padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
          }}
        >
          Os valores por item registrados na fonte somam {formatMoney(soma)} — acima do valor final
          do processo ({formatMoney(valorFinalProcesso)}). Alguns itens podem conter erro de
          digitação na própria ata; confira sempre a fonte oficial.
        </p>
      ) : null}

      {comDados.length ? (
        <div className="products-table">
          {comDados.map((item) => (
            <ProductRow key={item.id} item={item} valorFinalProcesso={valorFinalProcesso} />
          ))}
        </div>
      ) : (
        <p className="empty-state">Os itens deste processo ainda não têm preço ou fornecedor na fonte.</p>
      )}

      {semDados.length ? (
        <details className="details-block" style={{ marginTop: comDados.length ? '16px' : '0' }}>
          <summary>
            {semDados.length} {semDados.length === 1 ? 'item citado sem preço/fornecedor' : 'itens citados sem preço/fornecedor'}
          </summary>
          <ul className="plain-list" style={{ marginTop: '12px' }}>
            {semDados.map((item) => (
              <li key={item.id}>{item.descricao}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionBlock>
  );
}
