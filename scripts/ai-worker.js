const { runPendingResumoAiJobs } = require('../src/ai/summary-job-worker');

async function main() {
  await runPendingResumoAiJobs();
  console.log('Worker de resumos IA finalizado.');
}

main().catch((error) => {
  console.error(`Falha no worker de resumos IA: ${error.message}`);
  process.exitCode = 1;
});
