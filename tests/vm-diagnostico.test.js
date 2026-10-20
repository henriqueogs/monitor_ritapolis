'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const source = fs.readFileSync(path.resolve(__dirname, '../scripts/vm-diagnostico.sh'), 'utf8');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

// Comandos simulados: nunca systemctl/journalctl/SSH reais.
const MOCKS = `
systemctl() { echo "systemctl $*" >> "$TEST_LOG"; printf 'NRestarts=2\\nActiveEnterTimestamp=Sun 2026-10-18 11:45:10 UTC\\nRestart=always\\n'; }
journalctl() {
  echo "journalctl $*" >> "$TEST_LOG"
  case "$*" in
    *"-k"*) echo 'Out of memory: Killed process 1234 (node) total-vm:900000kB';;
    *caddy*) echo '{"level":"error","msg":"dial tcp 127.0.0.1:3001: connect: connection refused","remote_ip":"200.1.2.3","uri":"/api/credores/12345678000190"}';;
    *) echo 'Oct 18 11:45:00 vm systemd[1]: monitor-ritapolis.service: Scheduled restart job, restart counter is at 2.';;
  esac
}
free() { echo '              total        used        free      shared  buff/cache   available'; echo 'Mem:            954         631          86           1         236         322'; echo 'Swap:          2047         162        1885'; }
uptime() { echo ' 11:50:00 up 3 days,  load average: 0.87, 0.60, 0.40'; }
df() { echo 'Filesystem Size Used Avail Use% Mounted'; echo '/dev/sda1 45G 15G 30G 33% /'; }
git() { echo "git $*" >> "$TEST_LOG"; echo "lockhash-atual"; }
sha256sum() { echo "abc123  $1"; }
`;

function runDiag(originalCommand, { marker = 'lockhash-atual', deployScript = 'x deploy-lock-hash y' } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-diag-test-'));
  const app = path.join(temp, 'app');
  fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(app, 'logs'));
  fs.mkdirSync(path.join(app, 'scripts'));
  fs.writeFileSync(path.join(app, 'deploy.sh'), deployScript);
  fs.writeFileSync(path.join(app, 'scripts', 'oracle-deploy.sh'), deployScript);
  if (marker !== null) {fs.writeFileSync(path.join(app, 'node_modules', '.deploy-lock-hash'), marker);}
  fs.writeFileSync(path.join(app, 'logs', 'app.log'), [
    '{"level":"error","message":"API key nvapi-AbCdEf0123456789xyz invalida para joao@exemplo.com","timestamp":"2026-10-18T11:44:30.000Z"}',
    '{"level":"warn","message":"fetch lento de 10.0.0.5 cpf 123.456.789-09","timestamp":"2026-10-18T11:45:00.000Z"}',
    '{"level":"error","message":"falha em GET /api/credores/pf-ana-lima de [2804:14c::1]:443 Basic dXNlcjpzZW5oYQ== chave a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8123456a1b2c3d4e5f6a7b8c9d0e1f2","meta":{"message":"meta aninhado nao sai"},"timestamp":"2026-10-18T11:46:00.000Z"}',
    '{"level":"info","message":"fora da janela","timestamp":"2026-10-18T09:00:00.000Z"}',
  ].join('\n'));
  const log = path.join(temp, 'calls.log');
  const script = source.replace('APP_DIR=/opt/monitor-ritapolis', `APP_DIR="${app}"`);
  fs.writeFileSync(path.join(temp, 'diag.sh'), MOCKS + script.replace(/\r/g, ''));
  const env = { ...process.env, TEST_LOG: log };
  if (originalCommand !== undefined) {env.SSH_ORIGINAL_COMMAND = originalCommand;}
  else {delete env.SSH_ORIGINAL_COMMAND;}
  const r = spawnSync(bash, ['diag.sh'], { cwd: temp, encoding: 'utf8', timeout: 10000, env });
  return { ...r, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

describe('vm-diagnostico.sh', () => {
  it('aceita janela ISO e resume deploy, systemd, memória, kernel, caddy e app.log', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50');

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('janela: 2026-10-18T11:40 -> 2026-10-18T11:50');
    expect(r.stdout).toContain('deploy_sh_versao_nova: sim');
    expect(r.stdout).toContain('marcador_lock: igual ao lockfile atual');
    expect(r.stdout).toContain('NRestarts=2');
    expect(r.stdout).toContain('Mem:');
    expect(r.stdout).toContain('oom_kills_na_janela: 1');
    expect(r.stdout).toContain('restarts_agendados_na_janela: 1');
    expect(r.stdout).toMatch(/caddy_erros_na_janela: 1/);
    expect(r.stdout).toContain('connection refused');
    expect(r.stdout).toMatch(/app_log_por_nivel: .*error=2.*warn=1/);
    expect(r.stdout).not.toContain('fora da janela');
    expect(r.calls).toContain('--since 2026-10-18 11:40');
  });

  it('nunca expõe segredos, IPs, e-mails, CPF ou números longos (repo público)', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50');

    expect(r.stdout).not.toMatch(/nvapi-AbCd/);
    expect(r.stdout).not.toMatch(/joao@exemplo\.com/);
    expect(r.stdout).not.toMatch(/10\.0\.0\.5|200\.1\.2\.3|127\.0\.0\.1/);
    expect(r.stdout).not.toMatch(/123\.456\.789-09|12345678000190/);
    expect(r.stdout).not.toContain('remote_ip');
    expect(r.stdout).not.toContain('/api/credores');
    expect(r.stdout).not.toMatch(/pf-ana-lima|2804:14c|dXNlcjpzZW5oYQ|a1b2c3d4e5f6a7b8c9d0e1f2/);
    expect(r.stdout).not.toContain('meta aninhado');
  });

  it('recusa parâmetro fora do formato sem executar nada (injeção pelo SSH_ORIGINAL_COMMAND)', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50; rm -rf /');

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('janela invalida');
    expect(r.calls).toBe('');
  });

  it('recusa janela invertida ou maior que 24h', () => {
    expect(runDiag('2026-10-18T12:00 2026-10-18T11:00').status).not.toBe(0);
    expect(runDiag('2026-10-16T11:00 2026-10-18T11:00').status).not.toBe(0);
  });

  it('sem parâmetro usa a última hora', () => {
    const r = runDiag(undefined);

    expect(r.status).toBe(0);
    expect(r.calls).toContain('--since -60min');
  });

  it('aponta deploy.sh antigo e marcador ausente', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50', { marker: null, deployScript: 'script antigo' });

    expect(r.stdout).toContain('deploy_sh_versao_nova: nao');
    expect(r.stdout).toContain('marcador_lock: ausente');
  });
});
