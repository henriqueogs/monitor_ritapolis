import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { labelFonte } from '../../lib/format';

export default function LimitsAndSources({ fontes }) {
  return (
    <SectionBlock title="Fontes oficiais">
      <div className="simple-table">
        {fontes.length ? (
          fontes.map((fonte) => (
            <Link key={fonte.fonte} href={`/acervo?fonte=${fonte.fonte}`} className="table-row">
              <span>{fonte.fonte_nome || labelFonte(fonte.fonte)}</span>
              <strong>ver fonte &rarr;</strong>
            </Link>
          ))
        ) : (
          <p className="empty-state">Nenhuma fonte coletada.</p>
        )}
      </div>
    </SectionBlock>
  );
}
