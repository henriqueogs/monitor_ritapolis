'use strict';

/**
 * Extração de itens fora da VM para editais grandes que o pipeline parou
 * (teto de tempo por documento). Três passos; só o último escreve, e só com
 * --apply. Lógica em src/ai/itens-local.js.
 *
 *   # 1) na VM (somente leitura) — saída em stdout
 *   node scripts/itens-local.js exportar --revisao > pacote.json
 *   node scripts/itens-local.js exportar --documentos=229,214 > pacote.json
 *
 *   # 2) na sua máquina (chave do provedor no .env; sem banco)
 *   node scripts/itens-local.js gerar pacote.json resultado.json
 *
 *   # 3) na VM — revalida texto, anexos, cobertura e citações antes de gravar
 *   node scripts/itens-local.js aplicar resultado.json            # dry-run
 *   node scripts/itens-local.js aplicar resultado.json --apply
 *   (use "-" no lugar do arquivo para ler da entrada padrão)
 */

try {
  process.loadEnvFile?.();
} catch {
  // sem .env (ex.: exportar/aplicar com o ambiente do serviço): segue com process.env
}

const fs = require('fs');
const logger = require('../src/logger');
const { montarPacote, gerarLocal, verificarResultado } = require('../src/ai/itens-local');

const ERRO_TETO_TEMPO = '%limite de tempo por documento%';

function readFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function lerJson(arquivo) {
  return JSON.parse(fs.readFileSync(arquivo === '-' ? 0 : arquivo, 'utf8'));
}

function idsParaExportar(db) {
  const lista = readFlag('documentos');
  if (lista) {
    return lista.split(',').map(Number);
  }
  if (!process.argv.includes('--revisao')) {
    throw new Error('Informe --revisao ou --documentos=1,2');
  }
  return db
    .prepare(
      `SELECT DISTINCT entity FROM pipeline_jobs p WHERE kind = 'items' AND status = 'failed'
       AND error LIKE ? AND NOT EXISTS (SELECT 1 FROM pipeline_jobs n WHERE n.kind = 'items'
         AND n.entity = p.entity AND n.id > p.id AND n.status IN ('pending','running','ok'))`
    )
    .all(ERRO_TETO_TEMPO)
    .map((r) => Number(r.entity));
}

function exportar() {
  const { db, getDocumentoById } = require('../src/db');
  const { listarAtasDoDocumento } = require('../src/ai/estruturar-itens-processo');
  const pacotes = idsParaExportar(db).flatMap((id) => {
    const documento = getDocumentoById(id);
    if (!documento?.texto_completo) {
      logger.warn('itens-local: documento sem texto, ignorado', { id });
      return [];
    }
    return [montarPacote({ documento, atas: listarAtasDoDocumento(id) })];
  });
  process.stdout.write(JSON.stringify({ pacotes }));
}

async function gerar() {
  const [entrada, saida] = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  const { createAiProvider } = require('../src/ai/providers');
  const provider = createAiProvider();
  const resultados = [];
  for (const pacote of lerJson(entrada).pacotes) {
    const id = pacote.documento.id;
    const inicio = Date.now();
    try {
      resultados.push(await gerarLocal(pacote, { provider }));
      logger.info('itens-local: gerado', { id, min: Math.round((Date.now() - inicio) / 60000) });
    } catch (err) {
      logger.error('itens-local: falhou', { id, erro: err.message });
    }
    fs.writeFileSync(saida, JSON.stringify({ resultados }));
  }
}

function aplicar() {
  const apply = process.argv.includes('--apply');
  const arquivo = process.argv.slice(3).find((a) => a === '-' || !a.startsWith('--'));
  const { getDocumentoById } = require('../src/db');
  const { salvarItensEstruturados } = require('../src/db/itens-estruturacao-jobs-repo');
  const { listarAtasDoDocumento } = require('../src/ai/estruturar-itens-processo');
  const linhas = lerJson(arquivo).resultados.map((resultado) => {
    const documento = getDocumentoById(resultado.documento_id);
    const atas = documento ? listarAtasDoDocumento(documento.id) : [];
    const veredito = documento
      ? verificarResultado({ resultado, documento, atas })
      : { ok: false, motivo: 'documento_inexistente' };
    if (veredito.ok && apply) {
      salvarItensEstruturados({ ...resultado, status: 'ok', erro: null });
    }
    return { documento_id: resultado.documento_id, ...veredito, gravado: veredito.ok && apply };
  });
  process.stdout.write(`${JSON.stringify({ apply, linhas })}\n`);
}

const comandos = { exportar, gerar, aplicar };
const comando = comandos[process.argv[2]];
if (!comando) {
  process.stderr.write('Uso: itens-local.js exportar|gerar|aplicar (ver cabecalho do arquivo)\n');
  process.exit(1);
}
Promise.resolve(comando()).catch((err) => {
  logger.error('itens-local: erro', { erro: err.message });
  process.exit(1);
});
