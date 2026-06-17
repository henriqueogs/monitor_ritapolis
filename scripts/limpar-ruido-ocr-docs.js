'use strict';

/**
 * Aplica o limpador de ruído de OCR (`limparRuidoOcr`) ao texto já gravado —
 * remove as linhas-lixo de brasão/carimbo/logo/assinatura que o OCR transformou
 * em caracteres aleatórios e regenera a coluna `resumo`. Não re-baixa nem re-OCR:
 * só limpa o que já está no banco.
 *
 * SEGURANÇA: na varredura geral só atua em documentos predominantemente ruído
 * (fração de linhas-lixo >= --fracao-min, padrão 0.40) — ou seja, scans ruins de
 * verdade. Isso evita corromper PDFs de texto onde linhas curtas legítimas
 * (e-mails, unidades "cx."/"Kg", números de página) não têm palavra/número.
 * Use --documento-id=N para limpar um documento específico ignorando o portão.
 *
 * Reentrante. Dry-run por padrão. Uso:
 *   node scripts/limpar-ruido-ocr-docs.js                 # dry-run (lista)
 *   node scripts/limpar-ruido-ocr-docs.js --apply
 *   node scripts/limpar-ruido-ocr-docs.js --documento-id=648 --apply
 *   node scripts/limpar-ruido-ocr-docs.js --fracao-min=0.3 --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { limparRuidoOcr, resumirTextoLimpo, linhaTemConteudo } = require('../src/utils/text');

const MIN_CHARS_RESTANTE = 80;
const FRACAO_RUIDO_PADRAO = 0.4;

function parseArgs(argv) {
  const o = { apply: false, documentoId: null, fracaoMin: FRACAO_RUIDO_PADRAO };
  for (const a of argv) {
    if (a === '--apply') {
      o.apply = true;
    } else if (a.startsWith('--documento-id=')) {
      o.documentoId = Number(a.split('=')[1]);
    } else if (a.startsWith('--fracao-min=')) {
      o.fracaoMin = Number(a.split('=')[1]);
    }
  }
  return o;
}

// Fração das linhas com conteúdo (não-vazias) que são puro ruído de OCR.
function fracaoRuido(texto) {
  const linhas = String(texto || '')
    .split('\n')
    .filter((l) => l.trim() !== '');
  if (linhas.length === 0) {
    return 0;
  }
  const ruido = linhas.filter((l) => !linhaTemConteudo(l)).length;
  return ruido / linhas.length;
}

function listar(documentoId) {
  if (documentoId) {
    return db
      .prepare('SELECT id, texto_completo FROM documentos WHERE id = ?')
      .all(documentoId);
  }
  return db
    .prepare(
      `SELECT id, texto_completo FROM documentos
        WHERE texto_completo IS NOT NULL AND texto_completo != ''`
    )
    .all();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const docs = listar(opts.documentoId);
  console.warn(`Documentos OCR a avaliar: ${docs.length}${opts.apply ? '' : ' (dry-run)'}`);

  const update = db.prepare(
    `UPDATE documentos
        SET texto_completo = @texto, resumo = @resumo, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id`
  );

  const cont = { limpos: 0, sem_ganho: 0, esvaziaria: 0, abaixo_portao: 0 };
  for (const d of docs) {
    const original = d.texto_completo || '';

    // Portão de fração: na varredura geral, só limpa scans predominantemente
    // ruído. Documento explícito (--documento-id) passa direto.
    if (!opts.documentoId) {
      const frac = fracaoRuido(original);
      if (frac < opts.fracaoMin) {
        cont.abaixo_portao += 1;
        continue;
      }
    }

    const limpo = limparRuidoOcr(original);
    const removidos = original.length - limpo.length;

    if (removidos <= 0) {
      cont.sem_ganho += 1;
      continue;
    }
    if (limpo.length < MIN_CHARS_RESTANTE) {
      cont.esvaziaria += 1;
      console.warn(`  #${d.id} — limpeza esvaziaria (restaria ${limpo.length} chars), mantém`);
      continue;
    }

    cont.limpos += 1;
    console.warn(`  #${d.id} — removidos ${removidos} chars de ruído (${original.length} → ${limpo.length})`);
    if (opts.apply) {
      update.run({ id: d.id, texto: limpo, resumo: resumirTextoLimpo(limpo) });
    }
  }

  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — limpos: ${cont.limpos} · sem ganho: ${cont.sem_ganho} · preservados (esvaziaria): ${cont.esvaziaria} · abaixo do portão (${opts.fracaoMin}): ${cont.abaixo_portao}`
  );
}

main();
