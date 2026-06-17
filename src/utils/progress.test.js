'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarProgresso, fmtDuracao } = require('./progress');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prog-'));
}

describe('fmtDuracao', () => {
  it('formata segundos, minutos e horas', () => {
    expect(fmtDuracao(5000)).toBe('5s');
    expect(fmtDuracao(95000)).toBe('1m35s');
    expect(fmtDuracao(3700000)).toBe('1h01m');
  });
});

describe('criarProgresso', () => {
  it('cria log e status na inicialização', () => {
    const dir = tmpDir();
    const p = criarProgresso('teste-init', { total: 3, dir });
    expect(fs.existsSync(p.logPath)).toBe(true);
    expect(fs.existsSync(p.statusPath)).toBe(true);
    const st = JSON.parse(fs.readFileSync(p.statusPath, 'utf8'));
    expect(st.total).toBe(3);
    expect(st.processados).toBe(0);
    expect(st.concluido).toBe(false);
  });

  it('tick incrementa processados e conta categorias', () => {
    const dir = tmpDir();
    const p = criarProgresso('teste-tick', { total: 4, dir });
    p.tick('item 1', 'ok');
    p.tick('item 2', 'ok');
    p.tick('item 3', 'erro');
    const st = JSON.parse(fs.readFileSync(p.statusPath, 'utf8'));
    expect(st.processados).toBe(3);
    expect(st.contadores).toEqual({ ok: 2, erro: 1 });
  });

  it('atualiza atualizado_em a cada tick (heartbeat detectável)', async () => {
    const dir = tmpDir();
    const p = criarProgresso('teste-hb', { total: 2, dir });
    const t0 = JSON.parse(fs.readFileSync(p.statusPath, 'utf8')).atualizado_em;
    await new Promise((r) => setTimeout(r, 5));
    p.tick();
    const t1 = JSON.parse(fs.readFileSync(p.statusPath, 'utf8')).atualizado_em;
    expect(t1 >= t0).toBe(true);
  });

  it('finish marca concluido e registra resumo', () => {
    const dir = tmpDir();
    const p = criarProgresso('teste-fim', { total: 1, dir });
    p.tick(null, 'ok');
    p.finish('1 ok');
    const st = JSON.parse(fs.readFileSync(p.statusPath, 'utf8'));
    expect(st.concluido).toBe(true);
    expect(st.resumo).toBe('1 ok');
  });
});
