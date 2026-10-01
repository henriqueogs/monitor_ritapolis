'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const source = fs.readFileSync(path.resolve(__dirname, '../scripts/oracle-deploy.sh'), 'utf8');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

function runDeploy({ installFail = false, dirty = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-deploy-test-'));
  const log = path.join(temp, 'calls.log');
  // Simulated commands only: never SSH, systemctl or production npm.
  const script = source.replace('cd /opt/monitor-ritapolis', 'cd "$TEST_DIR"');
  const mocks = `
git() {
echo "git $*" >> "$TEST_LOG"
if [[ "$1" == diff && "$TEST_DIRTY" == 1 ]]; then return 1; fi
return 0
}
npm() {
echo "npm $*" >> "$TEST_LOG"
return "$TEST_INSTALL_FAIL"
}
sudo() {
echo "sudo $*" >> "$TEST_LOG"
if [[ "$2" == is-active && "$3" == --quiet ]]; then return 3; fi
return 0
}
sleep() { return 0; }
`;
  fs.writeFileSync(path.join(temp, 'deploy.sh'), mocks + script.replace(/\r/g, ''));
  const result = spawnSync(bash, ['deploy.sh'], { cwd: temp, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PATH: `${temp}${path.delimiter}${process.env.PATH}`,
      TEST_DIR: temp, TEST_LOG: log, TEST_DIRTY: dirty ? '1' : '0', TEST_INSTALL_FAIL: installFail ? '1' : '0' } });
  return { ...result, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
}

test('deploy stops queue before replacing code/dependencies and starts only after install', () => {
  const r = runDeploy();
  expect(r.error).toBeUndefined();
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  expect(r.calls.indexOf('sudo systemctl stop monitor-ritapolis')).toBeLessThan(r.calls.indexOf('git merge --ff-only origin/master'));
  expect(r.calls.indexOf('git merge --ff-only origin/master')).toBeLessThan(r.calls.indexOf('npm ci --omit=dev'));
  expect(r.calls.indexOf('npm ci --omit=dev')).toBeLessThan(r.calls.indexOf('sudo systemctl start monitor-ritapolis'));
});
test('failed install does not start half-installed app, dirty checkout does not stop it', () => {
  const failed = runDeploy({ installFail: true });
  expect(failed.status).not.toBe(0);
  expect(failed.calls).not.toContain('sudo systemctl start monitor-ritapolis');
  expect(failed.stderr).toContain('Deployment failed: API stopped');
  const dirty = runDeploy({ dirty: true });
  expect(dirty.status).not.toBe(0);
  expect(dirty.calls).not.toContain('sudo systemctl stop monitor-ritapolis');
  expect(dirty.calls).not.toContain('npm ci --omit=dev');
});
