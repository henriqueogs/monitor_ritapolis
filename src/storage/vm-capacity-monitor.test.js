'use strict';

const { parseRelatorioCapacidade, avaliarCapacidade } = require('./vm-capacity-monitor');

// Saída real de report-capacity.sh, capturada da VM em produção (28/08/2026).
const RELATORIO_REAL = `--- memoria (MB) ---
               total        used        free      shared  buff/cache   available
Mem:             954         521          69           4         534         432
Swap:           2047          76        1971
--- disco (/) ---
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        45G  5.7G   39G  13% /
--- carga ---
 20:55:56 up  6:05,  1 user,  load average: 0.27, 0.09, 0.02
`;

describe('vm-capacity-monitor', () => {
  describe('parseRelatorioCapacidade', () => {
    it('extrai memoria, swap, disco e carga do relatorio real da VM', () => {
      const r = parseRelatorioCapacidade(RELATORIO_REAL);
      expect(r).toEqual({
        memTotalMb: 954,
        memUsedMb: 521,
        memFreeMb: 69,
        memUsedPercent: 55,
        swapUsedMb: 76,
        diskUsedPercent: 13,
        loadAvg1m: 0.27,
      });
    });

    it('retorna null quando o texto nao tem o formato esperado', () => {
      expect(parseRelatorioCapacidade('lixo qualquer')).toBeNull();
      expect(parseRelatorioCapacidade('')).toBeNull();
    });
  });

  describe('avaliarCapacidade', () => {
    it('status ok quando nada passa do limiar (caso real atual)', () => {
      const relatorio = parseRelatorioCapacidade(RELATORIO_REAL);
      expect(avaliarCapacidade(relatorio)).toEqual({ status: 'ok', motivos: [] });
    });

    it('sinaliza pressao quando memoria passa do limiar', () => {
      const r = avaliarCapacidade({ memUsedPercent: 90, diskUsedPercent: 10, swapUsedMb: 0 });
      expect(r.status).toBe('pressao');
      expect(r.motivos[0]).toMatch(/Memoria em 90%/);
    });

    it('sinaliza pressao quando disco passa do limiar', () => {
      const r = avaliarCapacidade({ memUsedPercent: 10, diskUsedPercent: 92, swapUsedMb: 0 });
      expect(r.status).toBe('pressao');
      expect(r.motivos[0]).toMatch(/Disco em 92%/);
    });

    it('sinaliza pressao quando ha uso relevante de swap', () => {
      const r = avaliarCapacidade({ memUsedPercent: 10, diskUsedPercent: 10, swapUsedMb: 800 });
      expect(r.status).toBe('pressao');
      expect(r.motivos[0]).toMatch(/Swap em uso: 800MB/);
    });

    it('respeita limiares customizados', () => {
      const r = avaliarCapacidade(
        { memUsedPercent: 60, diskUsedPercent: 10, swapUsedMb: 0 },
        { memoriaPercent: 50 }
      );
      expect(r.status).toBe('pressao');
    });
  });
});
