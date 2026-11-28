'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  limparPendentesAntigos,
  espacoNecessarioBytes,
  verificarEspacoParaBackup,
  IDADE_MINIMA_PENDENTE_MS,
} = require('./snapshot-espaco');

let dir;
const agora = new Date('2026-11-27T12:00:00Z');
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-espaco-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function criar(nome, { idadeMs, bytes = 10 }) {
  const arquivo = path.join(dir, nome);
  fs.writeFileSync(arquivo, Buffer.alloc(bytes));
  const quando = new Date(agora.getTime() - idadeMs);
  fs.utimesSync(arquivo, quando, quando);
  return arquivo;
}

describe('limparPendentesAntigos', () => {
  it('apaga também os arquivos -journal, -wal e -shm da cópia interrompida', () => {
    // Arrange
    const base = 'pending-0f8e2c1a-1b2c-4d3e-8f90-123456789abc.db';
    const sufixos = ['-journal', '-wal', '-shm'];
    const arquivos = sufixos.map(s => criar(base + s, { idadeMs: IDADE_MINIMA_PENDENTE_MS + 1 }));

    // Act
    const resultado = limparPendentesAntigos(dir, { agora });

    // Assert
    expect(resultado.removidos).toBe(3);
    expect(arquivos.some(a => fs.existsSync(a))).toBe(false);
  });

  it('apaga sobras pending-* de backups interrompidos e mantém as cópias confirmadas', () => {
    // Arrange
    const antigo = criar('pending-0f8e2c1a-1b2c-4d3e-8f90-123456789abc.db', { idadeMs: IDADE_MINIMA_PENDENTE_MS + 1, bytes: 100 });
    const antigoGz = criar('pending-0f8e2c1a-1b2c-4d3e-8f90-123456789abc.db.gz', { idadeMs: IDADE_MINIMA_PENDENTE_MS + 1, bytes: 40 });
    const confirmada = criar(`${'a'.repeat(64)}.db`, { idadeMs: 10 * IDADE_MINIMA_PENDENTE_MS });

    // Act
    const resultado = limparPendentesAntigos(dir, { agora });

    // Assert
    expect(resultado).toEqual({ removidos: 2, bytesLiberados: 140 });
    expect(fs.existsSync(antigo)).toBe(false);
    expect(fs.existsSync(antigoGz)).toBe(false);
    expect(fs.existsSync(confirmada)).toBe(true);
  });

  it('não toca em pending recente: pode ser um backup manual em andamento', () => {
    const recente = criar('pending-7a6b5c4d-1111-4222-8333-444455556666.db', { idadeMs: IDADE_MINIMA_PENDENTE_MS - 60000 });

    expect(limparPendentesAntigos(dir, { agora })).toEqual({ removidos: 0, bytesLiberados: 0 });
    expect(fs.existsSync(recente)).toBe(true);
  });

  it('ignora nomes fora do padrão e pasta inexistente', () => {
    const outro = criar('pending-notas.txt', { idadeMs: 10 * IDADE_MINIMA_PENDENTE_MS });

    expect(limparPendentesAntigos(dir, { agora }).removidos).toBe(0);
    expect(fs.existsSync(outro)).toBe(true);
    expect(limparPendentesAntigos(path.join(dir, 'nao-existe'), { agora }).removidos).toBe(0);
  });
});

describe('verificarEspacoParaBackup', () => {
  it('exige espaço para a cópia do banco, o gzip e uma folga', () => {
    expect(espacoNecessarioBytes(1000)).toBeGreaterThan(2000);
  });

  it('recusa com mensagem clara quando o disco não comporta a cópia', () => {
    expect(() => verificarEspacoParaBackup({ bancoBytes: 1000, livreBytes: 1500 }))
      .toThrow(/Sem espaco em disco para o backup/);
  });

  it('aceita quando há espaço', () => {
    expect(() => verificarEspacoParaBackup({ bancoBytes: 1000, livreBytes: espacoNecessarioBytes(1000) }))
      .not.toThrow();
  });
});
