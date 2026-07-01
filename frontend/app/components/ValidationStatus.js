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
          ? 'Leitura disponivel'
          : hasExtractedText
            ? 'Conteudo pronto para leitura'
            : 'Leitura limitada'}
      </strong>
      <p>
        {dados
          ? 'Ha uma leitura em linguagem simples criada a partir do documento oficial.'
          : hasExtractedText
            ? 'O documento ja pode ser lido pela plataforma, mas ainda nao recebeu leitura simples.'
            : 'A fonte oficial existe, mas o conteudo ainda nao esta legivel para a plataforma.'}
      </p>
      <ul>
        <li>{hasOfficialFile ? 'Arquivo oficial vinculado' : 'Arquivo oficial nao vinculado'}</li>
        <li>{hasExtractedText ? 'Conteudo legivel pela plataforma' : 'Conteudo ainda limitado'}</li>
        <li>{dados && compatible ? 'Leitura simples atualizada' : 'Leitura simples pendente'}</li>
      </ul>
      <p className="admin-only">
        {dados
          ? `Resumo IA gerado em ${formatDate(resumoAi.criado_em)} com ${confidenceLabel(dados.confianca)}.`
          : null}
        {compatible ? ' Resumo compativel com o texto atual.' : ' Resumo precisa ser atualizado.'}
      </p>
    </div>
  );
}
