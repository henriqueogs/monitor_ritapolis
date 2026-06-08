import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { labelTipo } from '../../lib/format';

export default function RecentThemeAnalyses({ itens }) {
  return (
    <SectionBlock title="Análises recentes conectáveis a temas">
      <div className="simple-table">
        {itens.length ? (
          itens.slice(0, 6).map((item) => (
            <Link key={item.documento_id} href={`/documento/${item.documento_id}`} className="table-row table-row-stacked">
              <div>
                <strong>{item.titulo_curto || item.numero || item.titulo}</strong>
                <p>{item.objeto || item.resumo_cidadao || 'Resumo disponível no detalhe.'}</p>
              </div>
              <span>{item.tipo_nome || labelTipo(item.tipo)}</span>
            </Link>
          ))
        ) : (
          <p className="empty-state">As análises aparecem aqui conforme os resumos IA forem gerados.</p>
        )}
      </div>
    </SectionBlock>
  );
}
