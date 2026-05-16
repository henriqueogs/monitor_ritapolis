import Link from 'next/link';
import { labelFonte, labelTipo } from '../../lib/format';

export default function AnalysisFeed({ itens }) {
  return (
    <div className="editorial-feed">
      <div className="feed-head">
        <h2>Analises recentes</h2>
        <Link href="/analises">Ver analises &rarr;</Link>
      </div>
      {itens.length ? (
        itens.slice(0, 4).map((item) => (
          <Link
            key={item.documento_id}
            href={`/documento/${item.documento_id}`}
            className="editorial-card"
          >
            <span>
              {item.tipo_nome || labelTipo(item.tipo)} - {item.fonte_nome || labelFonte(item.fonte)}
            </span>
            <h3>{item.titulo_curto || item.numero || item.titulo}</h3>
            <p>{item.objeto || item.resumo_cidadao || 'Leitura disponivel no detalhe do documento.'}</p>
          </Link>
        ))
      ) : (
        <div className="editorial-card">
          <span>IA em preparacao</span>
          <h3>As leituras aparecem conforme os resumos reais forem gerados</h3>
          <p>Nenhuma analise demonstrativa sera exibida como dado publico confiavel.</p>
        </div>
      )}
    </div>
  );
}
