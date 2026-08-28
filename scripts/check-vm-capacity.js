'use strict';

/**
 * Lê o relatorio de report-capacity.sh (via stdin, ja trazido por SSH no
 * workflow) e avalia se a VM esta sob pressao real de recursos.
 * Uso: ssh ... /opt/monitor-ritapolis/report-capacity.sh | node scripts/check-vm-capacity.js
 */

const { parseRelatorioCapacidade, avaliarCapacidade } = require('../src/storage/vm-capacity-monitor');

let entrada = '';
process.stdin.on('data', (chunk) => { entrada += chunk; });
process.stdin.on('end', () => {
  const relatorio = parseRelatorioCapacidade(entrada);
  if (!relatorio) {
    process.stderr.write(`Nao foi possivel interpretar o relatorio de capacidade:\n${entrada}\n`);
    process.exitCode = 1;
    return;
  }

  const avaliacao = avaliarCapacidade(relatorio);
  process.stdout.write(`${JSON.stringify({ relatorio, avaliacao }, null, 2)}\n`);

  if (avaliacao.status === 'pressao') {
    process.stderr.write(
      `VM sob pressao: ${avaliacao.motivos.join('; ')}. ` +
      'So agora vale checar se ha capacidade A1.Flex disponivel antes de migrar ' +
      '(ver docs/DEPLOY.md).\n'
    );
    process.exitCode = 2;
  }
});
