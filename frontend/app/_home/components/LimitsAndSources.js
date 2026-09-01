import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { labelFonte } from '../../lib/format';

export default function LimitsAndSources({ fontes }) {
  // Câmara fora da coleta automática (site parado, sem novidades desde
  // 05/2026) — não listamos como fonte ativa pro cidadão.
  const fontesAtivas = fontes.filter((fonte) => fonte.fonte !== 'camara');
  return (
    <SectionBlock title="Fontes oficiais">
      <div className="simple-table">
        {fontesAtivas.length ? (
          fontesAtivas.map((fonte) => (
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
