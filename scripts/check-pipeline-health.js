'use strict';

// Lê o JSON de GET /api/saude/pipeline (stdin), imprime um resumo e sai com
// código 1 quando status=alerta — usado pelo workflow pipeline-health.yml.

function main(raw) {
  let saude;
  try {
    saude = JSON.parse(raw);
  } catch (err) {
    console.error(`Resposta inválida do endpoint de saúde: ${err.message}`);
    process.exit(1);
  }
  const d = saude.documentos_recentes || {};
  const ia = saude.ia || {};
  console.log(`status=${saude.status} motivos=${(saude.motivos || []).join(',') || '-'}`);
  console.log(`ultimo_resumo_ok=${ia.ultimo_resumo_ok?.em || 'nunca'} modelo=${ia.ultimo_resumo_ok?.modelo || '-'}`);
  console.log(`ultimo_erro=${ia.ultimo_erro?.em || '-'} categoria=${ia.ultimo_erro?.categoria || '-'}`);
  console.log(`ultimo_ciclo=${ia.scheduler?.ultimo_ciclo || '-'} resultado=${JSON.stringify(ia.scheduler?.ultimo_resultado || null)}`);
  console.log(`recentes(${d.janela_dias}d desde ${d.desde}): com_texto=${d.total_com_texto} sem_resumo=${d.sem_resumo} sem_texto=${d.sem_texto} mais_antigo_sem_resumo=${d.mais_antigo_sem_resumo || '-'}`);
  if (saude.status !== 'ok') {
    console.error('::error::Pipeline de IA em alerta — ver motivos acima.');
    process.exit(1);
  }
}

let entrada = '';
process.stdin.on('data', (c) => { entrada += c; });
process.stdin.on('end', () => main(entrada));
