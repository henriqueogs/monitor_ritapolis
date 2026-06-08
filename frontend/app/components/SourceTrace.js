import { formatDate, labelFonte } from '../lib/format';

export default function SourceTrace({ documento }) {
  return (
    <div className="source-trace">
      <div>
        <strong>{documento.fonte_nome || labelFonte(documento.fonte)}</strong>
        <p>
          Coletado em {formatDate(documento.coletado_em || documento.atualizado_em)}.{' '}
          {documento.indicadores?.tem_texto_extraido
            ? `${documento.texto_completo_chars?.toLocaleString('pt-BR') || 0} caracteres extraidos.`
            : 'Texto ainda nao extraido.'}
        </p>
      </div>
    </div>
  );
}
