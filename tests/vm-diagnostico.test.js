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
    *"-k"*) printf '%s\n' 'Out of memory: Killed process 1234 (node) total-vm:900000kB' 'watchdog: BUG: soft lockup - CPU#0 stuck for 22s! [node:1234]' 'TCP: request_sock_TCP: Possible SYN flooding on port 443. Sending cookies.';;
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

const CLASSIFICADOR = path.resolve(__dirname, '../src/ai/classificar-erro-ia.js');

// /proc falso: steal = 10% do total desde o boot; contadores TCP e de interface conhecidos.
function criarProcFalso(temp) {
  const proc = path.join(temp, 'proc');
  fs.mkdirSync(path.join(proc, 'net'), { recursive: true });
  fs.mkdirSync(path.join(proc, 'pressure'));
  fs.writeFileSync(path.join(proc, 'stat'), 'cpu  500 0 200 200 0 0 0 100 0 0\ncpu0 500 0 200 200 0 0 0 100 0 0\n');
  fs.writeFileSync(path.join(proc, 'pressure', 'cpu'), 'some avg10=12.50 avg60=8.00 avg300=3.10 total=123\n');
  fs.writeFileSync(path.join(proc, 'net', 'snmp'), [
    'Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts',
    'Tcp: 1 200 120000 -1 10 50 3 4 5 1000 2000 40 0 7',
  ].join('\n'));
  fs.writeFileSync(path.join(proc, 'net', 'netstat'), [
    'TcpExt: SyncookiesSent ListenOverflows ListenDrops TCPTimeouts TCPAbortOnTimeout',
    'TcpExt: 2 6 8 9 1',
  ].join('\n'));
  // Processos: stat com utime/stime (campos 14 e 15) e cmdline separado por NUL.
  // starttime em ticks desde o boot (CLK_TCK 100); uptime 1001 s. Idades: 100 s, 10 s, 1000 s.
  fs.writeFileSync(path.join(proc, 'uptime'), '1001.00 500.00\n');
  const processos = [
    ['101', 'node', 'node\x00/opt/monitor-ritapolis/scripts/render-start.js\x00', 3000, 1000, 90100],
    ['102', 'node', 'node\x00/opt/monitor-ritapolis/scripts/pipeline-worker.js\x00098765\x00', 500, 100, 99100],
    ['103', 'caddy', '/usr/bin/caddy\x00run\x00--config\x00/etc/caddy/Caddyfile\x00', 200, 100, 100],
  ];
  for (const [pid, comm, cmdline, utime, stime, inicio] of processos) {
    fs.mkdirSync(path.join(proc, pid));
    fs.writeFileSync(path.join(proc, pid, 'comm'), `${comm}\n`);
    fs.writeFileSync(path.join(proc, pid, 'cmdline'), cmdline);
    fs.writeFileSync(
      path.join(proc, pid, 'stat'),
      `${pid} (${comm}) S 1 1 1 0 -1 0 0 0 0 0 ${utime} ${stime} 0 0 20 0 1 0 ${inicio} 0 0\n`
    );
  }
  fs.writeFileSync(path.join(proc, 'net', 'dev'), [
    'Inter-|   Receive                                                |  Transmit',
    ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
    '    lo: 100 1 0 0 0 0 0 0 100 1 0 0 0 0 0 0',
    '  ens3: 9000 90 0 11 0 0 0 0 8000 80 0 22 0 0 0 0',
  ].join('\n'));
  return proc;
}

function runDiag(
  originalCommand,
  { marker = 'lockhash-atual', deployScript = 'x deploy-lock-hash y', comClassificador = true } = {}
) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-diag-test-'));
  const app = path.join(temp, 'app');
  fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(app, 'logs'));
  fs.mkdirSync(path.join(app, 'scripts'));
  if (comClassificador) {
    fs.mkdirSync(path.join(app, 'src', 'ai'), { recursive: true });
    fs.copyFileSync(CLASSIFICADOR, path.join(app, 'src', 'ai', 'classificar-erro-ia.js'));
  }
  fs.writeFileSync(path.join(app, 'deploy.sh'), deployScript);
  fs.writeFileSync(path.join(app, 'scripts', 'oracle-deploy.sh'), deployScript);
  if (marker !== null) {fs.writeFileSync(path.join(app, 'node_modules', '.deploy-lock-hash'), marker);}
  fs.writeFileSync(path.join(app, 'logs', 'app.log'), [
    '{"level":"error","message":"API key nvapi-AbCdEf0123456789xyz invalida para joao@exemplo.com","timestamp":"2026-10-18T11:44:30.000Z"}',
    '{"level":"warn","message":"fetch lento de 10.0.0.5 cpf 123.456.789-09","timestamp":"2026-10-18T11:45:00.000Z"}',
    '{"level":"error","message":"falha em GET /api/credores/pf-ana-lima de [2804:14c::1]:443 Basic dXNlcjpzZW5oYQ== chave a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8123456a1b2c3d4e5f6a7b8c9d0e1f2","meta":{"message":"meta aninhado nao sai"},"timestamp":"2026-10-18T11:46:00.000Z"}',
    '{"level":"warn","message":"Chunk de resumo IA falhou; reprocessando em subchunks menores","erro":"Request timed out after 120000ms em 10.0.0.9","timestamp":"2026-10-18T11:47:00.000Z"}',
    '{"level":"warn","message":"Pipeline: tarefa falhou","id":42,"kind":"summary","error":"429 Too Many Requests key nvapi-Zz9","timestamp":"2026-10-18T11:48:00.000Z"}',
    '{"level":"info","message":"fora da janela","timestamp":"2026-10-18T09:00:00.000Z"}',
  ].join('\n'));
  const proc = criarProcFalso(temp);
  const log = path.join(temp, 'calls.log');
  const script = source
    .replace('APP_DIR=/opt/monitor-ritapolis', `APP_DIR="${app}"`)
    .replace('PROC_DIR=/proc', `PROC_DIR="${proc}"`)
    .replace('AMOSTRA_STEAL_S=5', 'AMOSTRA_STEAL_S=0');
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
    expect(r.stdout).toMatch(/app_log_por_nivel: .*error=2.*warn=3/);
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

  it('conta falhas de IA por categoria do erro, sem o texto do erro', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50');

    expect(r.stdout).toMatch(/1 timeout \| Chunk de resumo IA falhou/);
    expect(r.stdout).toMatch(/1 limite_provider \| Pipeline: tarefa falhou/);
    expect(r.stdout).toMatch(/1 sem_detalhe \| API key \[segredo\]/);
    expect(r.stdout).not.toMatch(/timed out after|Too Many Requests|10\.0\.0\.9|nvapi-Zz9/);
  });

  it('sem o classificador instalado, informa a categoria como indisponível', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50', { comClassificador: false });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('app_log_por_nivel:');
    expect(r.stdout).toMatch(/1 indisponivel \| Chunk de resumo IA falhou/);
  });

  it('mostra CPU roubada (steal), pressão de CPU e contadores TCP/interface para separar CPU de rede', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50');

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('== cpu e rede');
    expect(r.stdout).toContain('cpu_steal_desde_boot_pct: 10.0');
    expect(r.stdout).toContain('cpu_steal_agora_pct: 0.0');
    expect(r.stdout).toContain('cpu_pressao: some avg10=12.50 avg60=8.00 avg300=3.10');
    expect(r.stdout).toContain('tcp_desde_boot: retrans_segs=40 retrans_pct=2.0 attempt_fails=3 estab_resets=4 out_rsts=7');
    expect(r.stdout).toContain('tcp_ext_desde_boot: listen_overflows=6 listen_drops=8 timeouts=9 abort_on_timeout=1 syncookies_sent=2');
    expect(r.stdout).toContain('interface_drops_desde_boot: rx=11 tx=22');
    expect(r.stdout).toContain('travamentos_kernel_na_janela: 1');
    expect(r.stdout).toContain('kernel_rede_na_janela: 1');
  });

  it('lista o consumo de CPU por processo só com o nome (node: nome do script, sem argumentos)', () => {
    const r = runDiag('2026-10-18T11:40 2026-10-18T11:50');

    expect(r.stdout).toMatch(
      /processo: node:render-start\.js cpu_amostra_pct=0\.0 cpu_media_desde_inicio_pct=40\.0 cpu_acumulada_s=40 qtd=1/
    );
    expect(r.stdout).toMatch(
      /processo: node:pipeline-worker\.js cpu_amostra_pct=0\.0 cpu_media_desde_inicio_pct=60\.0 cpu_acumulada_s=6 qtd=1/
    );
    expect(r.stdout).toMatch(/processo: caddy cpu_amostra_pct=0\.0 cpu_media_desde_inicio_pct=0\.3 cpu_acumulada_s=3 qtd=1/);
    // Empate na amostra: ordena pela média desde o início (processo novo e pesado vem antes do antigo).
    const ordem = ['node:pipeline-worker.js', 'node:render-start.js', 'processo: caddy'].map((n) => r.stdout.indexOf(n));
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    expect(r.stdout).not.toMatch(/98765|Caddyfile|\/opt\/monitor/);
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
