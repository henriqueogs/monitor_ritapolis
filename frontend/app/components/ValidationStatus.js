import { formatDate } from '../lib/format';

function confidenceLabel(value) {
  if (value == null || value === '') return 'confianca nao informada';
  return `${Math.round(Number(value) * 100)}% de confianca`;
}

export default function ValidationStatus({ resumoAi, documento }) {
  const dados = resumoAi?.dados;
  const hasOfficialFile = Boolean(documento?.indicadores?.tem_pdf || documento?.url_pdf);
  const hasExtractedText = Boolean(documento?.indicadores?.tem_texto_extraido || documento?.texto_completo);
  const compatible = resumoAi?.corresponde_ao_texto_atual !== false;
  const tone = dados && compatible ? 'real' : hasExtractedText ? 'parcial' : 'pendente';

  return (
    <div className={`validation-status is-${tone}`}>
      <strong>
        {dados && compatible
          ? 'Analise com evidencia no texto extraido'
          : hasExtractedText
            ? 'Pronto para analise'
            : 'Validacao limitada'}
      </strong>
      <p>
        {dados
          ? `Resumo IA gerado em ${formatDate(resumoAi.criado_em)} com ${confidenceLabel(dados.confianca)}.`
          : hasExtractedText
            ? 'O texto oficial ja foi extraido, mas ainda nao ha resumo IA para este documento.'
            : 'A fonte oficial existe, mas o texto ainda nao esta disponivel para analise automatica.'}
      </p>
      <ul>
        <li>{hasOfficialFile ? 'Arquivo oficial vinculado' : 'Arquivo oficial nao vinculado'}</li>
        <li>{hasExtractedText ? 'Texto extraido disponivel' : 'Texto extraido indisponivel'}</li>
        <li>{compatible ? 'Resumo compativel com o texto atual' : 'Resumo precisa ser atualizado'}</li>
      </ul>
    </div>
  );
}
