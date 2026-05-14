const { summarizePendingDocuments } = require('../src/ai/summarize-pending-documents');

function readFlag(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

async function main() {
  const limite = Number(readFlag('limite', 20));
  const concorrencia = Number(readFlag('concorrencia', 1));
  const maxCharsFlag = readFlag('max-chars', null);
  const maxChars = maxCharsFlag ? Number(maxCharsFlag) : null;
  const minCharsFlag = readFlag('min-chars', null);
  const minChars = minCharsFlag ? Number(minCharsFlag) : null;
  const ano = readFlag('ano', null);
  const tipo = readFlag('tipo', null);
  const fonte = readFlag('fonte', null);
  const dryRun = process.argv.includes('--dry-run');
  const result = await summarizePendingDocuments({
    limite,
    concorrencia,
    maxChars,
    minChars,
    ano,
    tipo,
    fonte,
    dryRun
  });

  if (result.dry_run) {
    console.log('Modo dry-run: nenhuma chamada de IA foi feita.');
    console.log(`Documentos selecionados: ${result.total_selecionados}`);
    if (result.candidatos.length) {
      console.log('');
      for (const item of result.candidatos) {
        console.log(
          `#${item.documento_id} | ${item.ano || 'sem ano'} | ${item.tipo} | ${item.texto_chars} chars | ${item.titulo}`
        );
      }
    }
    return;
  }

  console.log(`Documentos selecionados: ${result.total_selecionados}`);
  console.log(`Processados: ${result.total_processados}`);
  console.log(`Sucesso: ${result.total_ok}`);
  console.log(`Erros: ${result.total_erro}`);

  if (result.resultados.length) {
    console.log('');
    for (const item of result.resultados) {
      if (item.status === 'ok') {
        console.log(
          `#${item.documento_id} ok | reutilizado=${item.reutilizado ? 'sim' : 'nao'} | confianca=${item.confianca}`
        );
      } else {
        console.log(`#${item.documento_id} erro | ${item.erro}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(`Falha ao resumir pendentes: ${error.message}`);
  process.exitCode = 1;
});
