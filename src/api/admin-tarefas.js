'use strict';

// Catálogo e execução das ferramentas de manutenção expostas no painel admin.
// Ferramentas longas rodam em background (têm rastreador de progresso e aparecem
// no painel de tarefas); ferramentas rápidas rodam de forma síncrona e devolvem
// o resumo na resposta.

const path = require('path');
const { spawn, execFile } = require('child_process');
const { lerStatusProgresso } = require('../utils/progress');

const RAIZ = path.resolve(__dirname, '..', '..');
const NODE = process.execPath;
const TIMEOUT_SINCRONO_MS = 120000;

const FERRAMENTAS = {
  'reocr-scans': {
    label: 'Re-OCR de PDFs-imagem',
    descricao: 'Detecta PDFs sem camada de texto e re-OCR a 300 DPI (corrige scans ruins).',
    script: 'reocr-documentos.js',
    args: ['--detectar-imagem', '--apply'],
    modo: 'background',
    progresso: 'reocr-detectar',
  },
  'verificar-procedencia': {
    label: 'Verificar procedência (editais)',
    descricao: 'Confirma na fonte oficial pelo número e reconcilia a data de publicação.',
    script: 'verificar-procedencia.js',
    args: ['--tipo=edital', '--apply'],
    modo: 'background',
    progresso: 'verificar-procedencia',
  },
  'ocr-anexos': {
    label: 'OCR de anexos pendentes',
    descricao: 'OCR local dos anexos marcados como requer_ocr.',
    script: 'ocr-anexos.js',
    args: ['--apply'],
    modo: 'background',
    progresso: 'ocr-anexos',
  },
  'validar-produtos-ia': {
    label: 'Validar produtos (IA)',
    descricao: 'Valida produtos pendentes conferindo contra o trecho-fonte.',
    script: 'validar-produtos-ia.js',
    args: ['--apply'],
    modo: 'background',
    progresso: 'validar-produtos-ia',
  },
  'limpar-camara': {
    label: 'Limpar lixo da Câmara',
    descricao: 'Remove referências externas/widgets sem fonte (federais, TCU, seletor de ano).',
    script: 'limpar-camara-sem-fonte.js',
    args: ['--apply'],
    modo: 'sincrono',
  },
  'backfill-ano': {
    label: 'Preencher ano faltante',
    descricao: 'Deriva o ano de documentos sem ano (título/número/data/texto).',
    script: 'backfill-ano-documentos.js',
    args: ['--apply'],
    modo: 'sincrono',
  },
  'corrigir-data': {
    label: 'Corrigir data de publicação',
    descricao: 'Usa a datahora do anexo; remove datas futuras (sessão).',
    script: 'corrigir-data-publicacao.js',
    args: ['--apply'],
    modo: 'sincrono',
  },
  'limpar-ruido-ocr': {
    label: 'Limpar ruído de OCR',
    descricao: 'Remove linhas-lixo de brasão/carimbo de scans já OCR (gate de fração).',
    script: 'limpar-ruido-ocr-docs.js',
    args: ['--apply'],
    modo: 'sincrono',
  },
};

function listarFerramentas() {
  return Object.entries(FERRAMENTAS).map(([id, f]) => ({
    id,
    label: f.label,
    descricao: f.descricao,
    modo: f.modo,
    progresso: f.progresso || null,
  }));
}

function tarefaEmExecucao(progresso) {
  if (!progresso) {
    return false;
  }
  const st = lerStatusProgresso().find((s) => s.nome === progresso);
  return Boolean(st && st.estado === 'ativo');
}

const RE_RESUMO = /Aplicado|Removidos|preenchidos|corrigidos|concluíd/i;

function executarFerramenta(id) {
  const f = FERRAMENTAS[id];
  if (!f) {
    return Promise.resolve({ ok: false, desconhecida: true, msg: `Ferramenta desconhecida: ${id}` });
  }

  if (f.modo === 'background') {
    if (tarefaEmExecucao(f.progresso)) {
      return Promise.resolve({ ok: false, jaRodando: true, msg: `${f.label} já está em execução.` });
    }
    const child = spawn(NODE, [path.join('scripts', f.script), ...f.args], {
      cwd: RAIZ,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return Promise.resolve({ ok: true, modo: 'background', msg: `${f.label} iniciado em background.` });
  }

  return new Promise((resolve) => {
    execFile(
      NODE,
      [path.join('scripts', f.script), ...f.args],
      { cwd: RAIZ, timeout: TIMEOUT_SINCRONO_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const linhas = String(stdout || stderr || '')
          .trim()
          .split('\n')
          .filter(Boolean);
        const resumo = [...linhas].reverse().find((l) => RE_RESUMO.test(l)) || linhas[linhas.length - 1] || 'concluído';
        resolve({ ok: !err, msg: resumo, erro: err ? err.message : null });
      }
    );
  });
}

module.exports = { FERRAMENTAS, listarFerramentas, executarFerramenta, lerStatusProgresso };
