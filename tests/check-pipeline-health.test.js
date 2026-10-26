'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../scripts/check-pipeline-health.js');

function rodar(saude) {
  return spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(saude), encoding: 'utf8' });
}

describe('check-pipeline-health.js', () => {
  it('lista as tarefas com falha (id, etapa, categoria) quando há tarefas_atuais_com_falha', () => {
    const r = rodar({
      status: 'alerta',
      motivos: ['tarefas_atuais_com_falha'],
      pipeline: {
        falhas_reais: 1,
        aguardando_revisao: 1,
        failures: [
          { id: 6101, kind: 'summary', categoria: 'timeout' },
          { id: 6090, kind: 'extract', categoria: 'revisao_fonte' },
        ],
      },
    });

    expect(r.status).toBe(1);
    expect(r.stdout).toContain('tarefas_com_falha: reais=1 aguardando_revisao=1');
    expect(r.stdout).toContain('falha id=6101 etapa=summary categoria=timeout');
    expect(r.stdout).toContain('falha id=6090 etapa=extract categoria=revisao_fonte');
  });

  it('sem bloco pipeline não imprime a seção de falhas e sai 0 quando ok', () => {
    const r = rodar({ status: 'ok', motivos: [] });

    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('tarefas_com_falha');
  });
});
