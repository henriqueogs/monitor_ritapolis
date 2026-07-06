import SectionBlock from '../../../components/SectionBlock';
import ItensSolicitados from './itens/ItensSolicitados';
import ResultadoLotes from './itens/ResultadoLotes';
import ResultadoGlobal from './itens/ResultadoGlobal';

/**
 * Seção "Itens do processo" em 3 blocos fiéis à fonte: demanda do edital,
 * resultado por lote (teto homologado) e resultado global.
 * Consome `produtos.estrutura` (read-model); fallback à lista plana se ausente.
 *
 * A extração hoje é heurística/regex e falha em documentos fora de padrão
 * (ex: anexo que é cronograma de medição de obra, não lista de itens — a
 * heurística não sabe distinguir e classifica linhas de cronograma como
 * item). Até a reextração via IA cobrir o documento (`origem_estrutura`),
 * o detalhamento fica visível só em modo interno — o público vê apenas a
 * contagem, nunca dado incerto como se fosse fato (§11).
 */
function PlaceholderPublico({ totalLinhas }) {
  return (
    <SectionBlock title="Itens deste processo">
      <p className="empty-state">
        {totalLinhas > 0
          ? `Este processo tem ${totalLinhas} linha${totalLinhas === 1 ? '' : 's'} de itens/resultado na fonte, mas o detalhamento ainda está em revisão de qualidade antes de ser publicado.`
          : 'Nenhum item estruturado para este documento.'}
      </p>
    </SectionBlock>
  );
}

function DetalhamentoInterno({ estrutura, documento }) {
  const { itens_solicitados, resultado_lotes, resultado_global, descartados, cobertura } = estrutura;
  const vazio = !itens_solicitados.length && !resultado_lotes.length && !resultado_global;

  return (
    <SectionBlock
      title="Itens deste processo"
      description="O que foi solicitado no edital e como ficou o resultado da licitação, direto das fontes oficiais. (Visível só em modo interno — extração ainda heurística, ver aviso.)"
    >
      <p
        style={{
          margin: '0 0 16px', padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
          background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
        }}
      >
        Extração heurística (regex), não IA — pode classificar linhas de tabelas fora de padrão
        (ex: cronograma de medição de obra) como se fossem itens. Oculto do público até a
        reextração via IA cobrir este documento.
      </p>

      {vazio ? (
        <p className="empty-state">Os itens deste processo ainda não têm preço ou fornecedor na fonte.</p>
      ) : null}

      {cobertura?.so_demanda ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          O resultado da licitação (vencedores e valores) ainda não foi publicado pela fonte — abaixo,
          apenas o que foi solicitado no edital.
        </p>
      ) : null}

      <ItensSolicitados itens={itens_solicitados} documento={documento} />
      <ResultadoLotes lotes={resultado_lotes} documento={documento} />
      <ResultadoGlobal global={resultado_global} documento={documento} />

      {descartados?.length ? (
        <details className="details-block" style={{ marginTop: 8 }}>
          <summary>
            {descartados.length} {descartados.length === 1 ? 'linha descartada' : 'linhas descartadas'} (ruído de leitura do PDF)
          </summary>
          <ul className="plain-list" style={{ marginTop: 12 }}>
            {descartados.map((d) => (
              <li key={d.id} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {d.descricao} <span style={{ opacity: 0.6 }}>· {d.motivo}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionBlock>
  );
}

function DetalhamentoPublicoIA({ estrutura, documento }) {
  const { itens_solicitados, resultado_lotes, resultado_global, cobertura } = estrutura;
  const vazio = !itens_solicitados.length && !resultado_lotes.length && !resultado_global;

  return (
    <SectionBlock
      title="Itens deste processo"
      description="O que foi solicitado no edital e como ficou o resultado da licitação, direto das fontes oficiais (extração assistida por IA, com o trecho de origem em cada linha)."
    >
      {vazio ? (
        <p className="empty-state">Não foi possível identificar itens ou resultado estruturado na fonte deste processo.</p>
      ) : null}

      {cobertura?.so_demanda ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          O resultado da licitação (vencedores e valores) ainda não foi publicado pela fonte — abaixo,
          apenas o que foi solicitado no edital.
        </p>
      ) : null}

      <ItensSolicitados itens={itens_solicitados} documento={documento} />
      <ResultadoLotes lotes={resultado_lotes} documento={documento} />
      <ResultadoGlobal global={resultado_global} documento={documento} />

      {cobertura?.lacunas?.length ? (
        <details className="details-block" style={{ marginTop: 8 }}>
          <summary>Informações não encontradas na fonte</summary>
          <ul className="plain-list" style={{ marginTop: 12 }}>
            {cobertura.lacunas.map((lacuna) => (
              <li key={lacuna} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lacuna}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionBlock>
  );
}

export default function LicitationProducts({ produtos, documento }) {
  const estrutura = produtos?.estrutura;
  const totalLinhas = (produtos?.dados || []).length;

  // Extração via IA (Fase G) já passou pelo gate de confiança no read-model
  // (produtos-repo.js) — pode ser exibida direto ao público, sem admin-only.
  if (estrutura?.cobertura?.origem_estrutura === 'ia') {
    return <DetalhamentoPublicoIA estrutura={estrutura} documento={documento} />;
  }

  if (!estrutura || totalLinhas === 0) {
    return <PlaceholderPublico totalLinhas={0} />;
  }

  return (
    <>
      <div className="admin-only">
        <DetalhamentoInterno estrutura={estrutura} documento={documento} />
      </div>
      <div className="public-only-placeholder">
        <PlaceholderPublico totalLinhas={totalLinhas} />
      </div>
    </>
  );
}
