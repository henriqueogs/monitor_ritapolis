const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(process.cwd(), 'scripts/pncp-diagnostico.js');
const args = [scriptPath, '--salvar', ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status ?? 1);
